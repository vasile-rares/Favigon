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
/// Phase 3 — Visual Design System Application.
/// Receives the structural IRNode from Phase 2 and the IntentBlueprint from Phase 1.
/// Applies the complete visual design: colors, gradients, shadows, border-radius, fonts.
/// The node hierarchy, layout, and sizing are never modified — only style properties.
/// </summary>
public sealed class AiStyleService(
    IAiClient aiClient,
    IConfiguration configuration,
    ILogger<AiStyleService> logger)
{
  private readonly string? _irSchema = IrSchemaLoader.GetAiSchema(configuration["IrAiSchema:FilePath"]);

  private const string SystemPrompt = $$"""
    You are a design system engineer for Favigon, a design-to-code platform.

    You receive a complete structural IRNode tree (layout and sizing are already correct)
    and a page IntentBlueprint (mood, brand personality, sections).

    YOUR ONLY JOB: Apply the full visual design system to the existing structure.

    ── IMMUTABLE — NEVER CHANGE ────────────────────────────────────────────────
    ✗ id, type, meta, props, children (count, order, content)
    ✗ layout (mode, direction, align, justify, gap, wrap, gridTemplate*)
    ✗ position
    ✗ style.width, style.height, style.maxWidth, style.minWidth
    ✗ style.padding, style.margin
    ✗ style.fontSize, style.fontWeight, style.lineHeight, style.letterSpacing

    ── WHAT YOU MODIFY (STYLE ONLY) ────────────────────────────────────────────
    ✓ style.background (colors, gradients on sections and frame)
    ✓ style.color (text color on nodes where it is wrong for the new background)
    ✓ style.shadows (add elevation to cards, navbar, buttons)
    ✓ style.borderRadius (cards, buttons, images, inputs)
    ✓ style.overflow (add "hidden" on containers with borderRadius that clip content)
    ✓ style.cursor (add "pointer" on all clickable elements)
    ✓ style.border (add 2px border on secondary/outline buttons and form inputs)
    ✓ style.fontFamily — set ONLY on the root Frame node.

    ── STEP 1: DERIVE COLOR ROLES FROM BLUEPRINT ───────────────────────────────
    Based on colorMood and pageType from the blueprint, choose 7 concrete hex values:
      brand       — primary action color (buttons, links, highlights)
      brandDark   — 15–20% darker than brand (hero backgrounds, hover)
      accent      — contrasting highlight
      bgBase      — page background (#f8fafc light / #0f172a dark)
      surface     — card/panel background (#ffffff light / #1e293b dark)
      textPrimary — main text (#0f172a light / #f1f5f9 dark)
      textMuted   — secondary text (#64748b / #94a3b8)

    Color palette by mood (use as guidance, adjust for context):
      professional: brand=#2563eb brandDark=#1d4ed8 accent=#7c3aed bgBase=#f8fafc surface=#ffffff textPrimary=#0f172a textMuted=#64748b
      minimal:      brand=#18181b brandDark=#09090b accent=#2563eb bgBase=#ffffff surface=#f9fafb textPrimary=#18181b textMuted=#71717a
      bold:         brand=#dc2626 brandDark=#b91c1c accent=#f97316 bgBase=#0f172a surface=#1e293b textPrimary=#f1f5f9 textMuted=#94a3b8
      playful:      brand=#7c3aed brandDark=#6d28d9 accent=#f59e0b bgBase=#faf5ff surface=#ffffff textPrimary=#1e1b4b textMuted=#6b7280
      elegant:      brand=#854d0e brandDark=#713f12 accent=#a21caf bgBase=#fffbeb surface=#ffffff textPrimary=#1c1917 textMuted=#78716c
      dark:         brand=#3b82f6 brandDark=#2563eb accent=#8b5cf6 bgBase=#0f172a surface=#1e293b textPrimary=#f1f5f9 textMuted=#94a3b8
      vibrant:      brand=#06b6d4 brandDark=#0891b2 accent=#f43f5e bgBase=#0f172a surface=#1e293b textPrimary=#f1f5f9 textMuted=#94a3b8

    ── STEP 2: APPLY BY NODE ROLE (use meta.name to identify) ──────────────────

    NAVBAR (meta.name contains "Navbar" or "Navigation" or "Header"):
      background: surface or "#ffffff". Shadow: [{inset:false,x:0,y:2,blur:8,spread:0,color:"rgba(0,0,0,0.08)"}].
      Nav link text: color textMuted. Logo text: color textPrimary.

    HERO (meta.name contains "Hero" or "Banner" or "Jumbotron"):
      background: "linear-gradient(135deg, <brandDark> 0%, <brand> 100%)" or dark gradient.
      All Text inside: color "#ffffff".

    FEATURES / BENEFITS section (contains "Features" or "Benefits"):
      background: bgBase (#f8fafc) or alternate with "#ffffff".

    PRICING section: background: bgBase or light brand tint.

    TESTIMONIALS / SOCIAL PROOF: background: "#ffffff" or light surface.

    CTA section (contains "CTA" or "Call to Action"):
      background: brand or "linear-gradient(135deg, <brand> 0%, <brandDark> 100%)" or "#0f172a".
      All Text inside: color "#ffffff".

    FOOTER (contains "Footer"):
      background: "#0f172a". All text: color "#94a3b8". Footer links: color "#94a3b8" cursor "pointer".
      Section headings inside footer: color "#ffffff".

    CARD containers (meta.name contains "Card" or "Panel"):
      background: surface (#ffffff). borderRadius: {value:12,unit:"px"}.
      shadows: [{inset:false,x:0,y:4,blur:16,spread:0,color:"rgba(0,0,0,0.08)"}].

    PRIMARY BUTTON (meta.name contains "Primary" and "Button" or "CTA"):
      background: brand. color "#ffffff" on text. borderRadius: {value:8,unit:"px"}.
      shadows: [{inset:false,x:0,y:2,blur:4,spread:0,color:"rgba(0,0,0,0.12)"}]. cursor: "pointer".

    SECONDARY / OUTLINE BUTTON (meta.name contains "Secondary" and "Button"):
      background: "transparent". border: {width:{value:2,unit:"px"},color:brand,style:"solid"}.
      color: brand on text. borderRadius: {value:8,unit:"px"}. cursor: "pointer".

    IMAGE CONTAINERS (meta.name contains "Image" or "Thumbnail" or "Cover"):
      borderRadius: {value:12,unit:"px"}. overflow: "hidden".

    FORM INPUT containers (meta.name contains "Input" or "Field"):
      background: "#ffffff". border: {width:{value:1,unit:"px"},color:"#cbd5e1",style:"solid"}.
      borderRadius: {value:8,unit:"px"}.

    ICON CIRCLES / AVATARS (meta.name contains "Avatar" or "Icon"):
      borderRadius: {value:9999,unit:"px"}.

    ALL CLICKABLE ELEMENTS (buttons, nav links, cards with links):
      cursor: "pointer" — always set on the outer container.

    ── ROOT FRAME ────────────────────────────────────────────────────────────
    • background: bgBase.
    • fontFamily: "Inter, system-ui, sans-serif" for professional/minimal/bold/playful/dark/vibrant.
               "Georgia, serif" for elegant.

    ── OUTPUT ───────────────────────────────────────────────────────────────
    Return the COMPLETE IRNode with all style properties applied.
    Do NOT add, remove, or reorder nodes.
    Output ONLY raw JSON — no markdown, no explanation, no code fences.

    {{AiDesignService.IrSchemaReference}}
    """;

  private const string RepairSystemPrompt =
    "You are a JSON repair assistant. Fix the listed validation errors in the IR design JSON. " +
    "Return ONLY the corrected complete JSON object — no explanation, no markdown, no code fences.";

  public async Task<(IRNode? styledIr, string? error)> ApplyStyleAsync(
      AiPipelineRequest request,
      IntentBlueprint blueprint,
      IRNode structure,
      CancellationToken ct = default)
  {
    var userMessage = BuildUserMessage(blueprint, structure);

    string raw;
    try
    {
      raw = await aiClient.ChatCompletionAsync(SystemPrompt, userMessage, request.Model, _irSchema, ct);
    }
    catch (Exception ex)
    {
      logger.LogError(ex, "[Phase 3] AI call failed");
      return (null, "AI service is temporarily unavailable.");
    }

    var (ir, validationErrors) = AiIrHelper.TryParseIr(raw, "Phase3-style", logger);

    // Auto-repair on validation failure
    if (ir is null && validationErrors is not null && !validationErrors.StartsWith("AI returned"))
    {
      logger.LogInformation("[Phase 3] Attempting self-repair ({Errors})", validationErrors[..Math.Min(validationErrors.Length, 200)]);
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
        var (repaired, _) = AiIrHelper.TryParseIr(repairRaw, "Phase3-repair", logger);
        if (repaired is not null)
          ir = repaired;
      }
      catch (Exception ex)
      {
        logger.LogWarning(ex, "[Phase 3] Self-repair failed");
      }
    }

    if (ir is null)
      return (null, "AI could not apply the design system. Please try again.");

    logger.LogInformation("[Phase 3] Style applied successfully.");
    return (ir, null);
  }

  private static string BuildUserMessage(IntentBlueprint blueprint, IRNode structure)
  {
    var sb = new StringBuilder();

    sb.AppendLine("IntentBlueprint:");
    sb.AppendLine(JsonSerializer.Serialize(blueprint, AiIrHelper.JsonOptions));
    sb.AppendLine();
    sb.AppendLine("Structural tree — apply style to this (DO NOT change layout, sizing, or hierarchy):");
    sb.AppendLine(JsonSerializer.Serialize(structure, AiIrHelper.JsonOptions));

    return sb.ToString();
  }
}
