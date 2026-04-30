using System.Text;
using System.Text.Json;
using Favigon.Application.DTOs.Requests;
using Favigon.Application.DTOs.Responses;
using Favigon.Application.Interfaces;
using Favigon.Converter.Models;
using Favigon.Converter.Schema;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

namespace Favigon.Application.Services;

/// <summary>
/// Phase 2 — Structural Layout.
/// Given an IntentBlueprint, generates a complete IRNode tree with correct hierarchy,
/// layout (flex/grid), sizing, and typography. Visual decoration (colors, shadows,
/// border-radius) is deliberately excluded — this is a layout wireframe.
/// </summary>
public sealed class AiStructureService(
    IAiClient aiClient,
    IConfiguration configuration,
    ILogger<AiStructureService> logger)
{
  private readonly string? _irSchema = IrSchemaLoader.GetAiSchema(configuration["IrAiSchema:FilePath"]);

  private const string SystemPrompt = $$"""
    You are a layout engineer for Favigon, a design-to-code platform.
    You receive a page IntentBlueprint and build the complete IRNode structural tree.

    OBJECTIVE: Correct node hierarchy, layout, and sizing. NO visual decoration.

    ── WHAT TO SET (REQUIRED) ─────────────────────────────────────────────────
    • Node hierarchy: Frame → sections → containers → leaf nodes. Max 4–5 levels deep.
    • layout on every Container/Frame: mode, direction, align, justify, gap, wrap.
    • style.width on every node: "%" for full-width, "px" for fixed, "fit-content" where needed.
    • style.height on every node: use the correct mode (see height rules below).
    • style.padding on sections and container groups: multiples of 8px only.
    • Typography on Text nodes ONLY — use EXACTLY these roles, no other values:
        Display/Hero: fontSize 64px fontWeight 800 lineHeight {value:1.15,unit:"em"} letterSpacing {value:-0.03,unit:"em"}
        Heading 1:    fontSize 48px fontWeight 700 lineHeight {value:1.2,unit:"em"}  letterSpacing {value:-0.02,unit:"em"}
        Heading 2:    fontSize 32px fontWeight 700 lineHeight {value:1.25,unit:"em"} letterSpacing {value:-0.02,unit:"em"}
        Heading 3:    fontSize 24px fontWeight 600 lineHeight {value:1.3,unit:"em"}  letterSpacing {value:-0.01,unit:"em"}
        Body:         fontSize 16px fontWeight 400 lineHeight {value:1.6,unit:"em"}  letterSpacing {value:0,unit:"em"}
        Label/Button: fontSize 14px fontWeight 600 lineHeight {value:1,unit:"em"}    letterSpacing {value:0.01,unit:"em"}
        Caption:      fontSize 12px fontWeight 400 lineHeight {value:1.4,unit:"em"}  letterSpacing {value:0,unit:"em"}
    • Text node height = round(fontSize_px × lineHeight) + 4px:
        Display→78px  H1→62px  H2→44px  H3→35px  Body→30px  Label→20px  Caption→21px
    • style.color on Text nodes: "#0f172a" primary, "#64748b" muted, "#ffffff" on dark bg.
    • position.mode: "relative" on ALL child nodes — never omit.
    • meta.name: a descriptive label that clearly identifies the node type and role.
      Use names like "Hero Section", "Primary CTA Button", "Feature Card", "Nav Logo" — these
      are used by Phase 3 (style) to identify node roles and apply correct visual treatment.
    • props.text: real, specific copy appropriate to the product/page type.
    • id: set to "1" on all nodes — will be reassigned automatically.

    ── WHAT NOT TO SET (FORBIDDEN — STYLE PHASE HANDLES THIS) ─────────────────
    ✗ NO background on any Container or Frame — omit or use "#ffffff" on cards/surfaces only.
    ✗ NO shadows.
    ✗ NO borderRadius.
    ✗ NO overflow.
    ✗ NO cursor.
    ✗ NO gradients.
    ✗ NO backgroundImage (image placeholders are allowed).
    ✗ NO fontFamily — set only on Frame in Phase 3.
    ✗ NO border.

    ── HEIGHT RULES ────────────────────────────────────────────────────────────
    • fit-content {value:0,unit:"fit-content"}: sections, cards, forms, footers, any container with variable content.
    • Fixed px {value:N,unit:"px"}: navbar (64px), button (48px), image containers, hero rows (480–640px).
    • 100% fill: ONLY when parent has fixed px height. NEVER inside a fit-content parent.
    • Root Frame: ALWAYS fit-content. NEVER minHeight, maxHeight, vh, vw.

    ── LAYOUT PATTERNS (from IntentBlueprint layoutHint) ───────────────────────
    horizontal-bar: flex row, height 64px, padding {left:48px,right:48px}, align:center, justify:spaceBetween.
    full-width-centered: flex column, align:center, justify:center, padding {top:96px,bottom:96px,left:0,right:0}.
    two-column-split: height fixed (480–640px), flex row, gap:48px, padding {left:80px,right:80px}. Left col width=(viewportWidth-160-gap)/2, height:100%. Right col: remaining width, height:100%.
    card-grid-3: section flex column gap:48px padding:96px 0. Inner wrapper maxWidth:1200px flex row wrap gap:32px. Card width:360px.
    card-grid-2: similar but 2 cards, width:576px each.
    card-grid-4: similar but 4 cards, width:264px each.
    single-column: flex column, align:center, gap:32px, padding:80px 0.
    multi-column-footer: flex row, justify:spaceBetween, padding {top:80px,bottom:80px,left:0,right:0}. Inner wrapper maxWidth:1200px.
    dashboard-sidebar: flex row, height:fit-content. Sidebar width:240px. Main: fill remaining width.
    form-centered: flex column, align:center, padding:80px 0. Form card width:480px.
    testimonial-row: flex row, gap:32px, padding:80px 0. Testimonial card width:360px.

    ── STRUCTURAL RULES ────────────────────────────────────────────────────────
    1. Root node MUST be type "Frame". Width 1280px (or requested viewport). Height fit-content.
    2. Every node needs meta.name, id, type, props, children.
    3. Text nodes: children:[], non-empty props.text.
    4. Every child of a flex/grid parent: position.mode "relative".
    5. No Container with width 0px. Every multi-child flex Container has layout.gap ≥ 8px.
    6. Split-column math: leftWidth + gap + rightWidth = parentWidth exactly.
    7. ONE Text node per logical text unit. NEVER split a heading across multiple nodes.
    8. Image placeholder: Container with style.backgroundImage "url(https://placehold.co/WxH.png)", backgroundSize:"cover", backgroundPosition:"center", backgroundRepeat:"no-repeat", explicit px width+height.
    9. Output ONLY raw JSON — no markdown, no explanation, no code fences.

    {{AiDesignService.IrSchemaReference}}
    """;

  private const string RepairSystemPrompt =
    "You are a JSON repair assistant. Fix the listed validation errors in the IR design JSON. " +
    "Return ONLY the corrected complete JSON object — no explanation, no markdown, no code fences.";

  public async Task<(IRNode? structure, string? error)> GenerateAsync(
      AiPipelineRequest request,
      IntentBlueprint blueprint,
      CancellationToken ct = default)
  {
    var userMessage = BuildUserMessage(request, blueprint);

    string raw;
    try
    {
      raw = await aiClient.ChatCompletionAsync(SystemPrompt, userMessage, request.Model, _irSchema, ct);
    }
    catch (Exception ex)
    {
      logger.LogError(ex, "[Phase 2] AI call failed");
      return (null, "AI service is temporarily unavailable.");
    }

    var (ir, validationErrors) = AiIrHelper.TryParseIr(raw, "Phase2-structure", logger);

    // Auto-repair on validation failure
    if (ir is null && validationErrors is not null && !validationErrors.StartsWith("AI returned"))
    {
      logger.LogInformation("[Phase 2] Attempting self-repair ({Errors})", validationErrors[..Math.Min(validationErrors.Length, 200)]);
      try
      {
        var brokenJson = AiIrHelper.ExtractJson(raw);
        var truncated = brokenJson.Length > 3000 ? brokenJson[..3000] + "... (truncated)" : brokenJson;
        var repairPrompt = $"""
          Validation errors:
          {validationErrors}

          Original request: {request.Prompt}
          Broken output (fix this):
          {truncated}
          """;

        var repairRaw = await aiClient.ChatCompletionAsync(RepairSystemPrompt, repairPrompt, request.Model, _irSchema, ct);
        var (repaired, _) = AiIrHelper.TryParseIr(repairRaw, "Phase2-repair", logger);
        if (repaired is not null)
          ir = repaired;
      }
      catch (Exception ex)
      {
        logger.LogWarning(ex, "[Phase 2] Self-repair failed");
      }
    }

    if (ir is null)
      return (null, "AI returned an invalid page structure. Please try rephrasing.");

    logger.LogInformation("[Phase 2] Structure generated: {NodeCount} nodes", CountNodes(ir));
    return (ir, null);
  }

  private static string BuildUserMessage(AiPipelineRequest request, IntentBlueprint blueprint)
  {
    var sb = new StringBuilder();
    sb.AppendLine("User request:");
    sb.AppendLine(request.Prompt);
    sb.AppendLine();
    sb.AppendLine($"Target viewport width: {request.ViewportWidth}px.");
    sb.AppendLine();
    sb.AppendLine("Page blueprint (build the structure for EXACTLY these sections, in this order):");

    foreach (var section in blueprint.Sections.OrderBy(s => s.Order))
      sb.AppendLine($"  {section.Order}. {section.Name} ({section.LayoutHint}) — {section.Purpose}");

    sb.AppendLine();
    sb.AppendLine($"Page type: {blueprint.PageType}");
    sb.AppendLine($"Brand: {blueprint.BrandPersonality}");
    sb.AppendLine($"Primary CTA text: \"{blueprint.PrimaryCta}\"");

    return sb.ToString();
  }

  private static int CountNodes(IRNode node)
  {
    var count = 1;
    foreach (var child in node.Children)
      count += CountNodes(child);
    return count;
  }
}
