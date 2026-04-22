using System.Runtime.CompilerServices;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using Favigon.Application.DTOs.Requests;
using Favigon.Application.DTOs.Responses;
using Favigon.Application.Interfaces;
using Favigon.Converter.Models;
using Favigon.Converter.Validation;
using Microsoft.Extensions.Logging;

namespace Favigon.Application.Services;

public partial class AiDesignService(IAiClient aiClient, ILogger<AiDesignService> logger) : IAiDesignService
{
  private static readonly JsonSerializerOptions JsonOptions = new()
  {
    PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
    DefaultIgnoreCondition = System.Text.Json.Serialization.JsonIgnoreCondition.WhenWritingNull,
    Converters = { new System.Text.Json.Serialization.JsonStringEnumConverter(JsonNamingPolicy.CamelCase) }
  };

  [GeneratedRegex(@"```(?:json)?\s*\n?([\s\S]*?)\n?\s*```")]
  private static partial Regex CodeFenceRegex();

  /// <summary>
  /// Strips markdown code fences and extracts the first JSON object from raw AI output.
  /// </summary>
  private static string ExtractJson(string raw)
  {
    var trimmed = raw.Trim();

    // Strip markdown code fences
    var fenceMatch = CodeFenceRegex().Match(trimmed);
    if (fenceMatch.Success)
      trimmed = fenceMatch.Groups[1].Value.Trim();

    // Find the outermost { ... } if there's extra text
    var firstBrace = trimmed.IndexOf('{');
    var lastBrace = trimmed.LastIndexOf('}');
    if (firstBrace >= 0 && lastBrace > firstBrace)
      trimmed = trimmed[firstBrace..(lastBrace + 1)];

    return trimmed;
  }

  private (IRNode? ir, string? error) TryParseIr(string raw, string context)
  {
    var json = ExtractJson(raw);

    IRNode? ir;
    try
    {
      ir = JsonSerializer.Deserialize<IRNode>(json, JsonOptions);
    }
    catch (JsonException ex)
    {
      logger.LogWarning(ex, "AI {Context} returned invalid JSON: {Raw}", context, json[..Math.Min(json.Length, 500)]);
      return (null, "AI returned an invalid design structure.");
    }

    if (ir is null)
      return (null, "AI returned an empty design.");

    AssignSequentialIds(ir);

    var errors = IrValidator.GetValidationErrors(ir);
    if (errors.Count > 0)
    {
      logger.LogWarning("AI {Context} IR failed validation: {Errors}", context, string.Join("; ", errors.Take(10)));
      return (null, string.Join("\n", errors.Take(10)));
    }

    return (ir, null);
  }

  public async Task<AiDesignResponse> GenerateDesignAsync(AiDesignRequest request, CancellationToken ct = default)
  {
    var userMessage = BuildUserMessage(request);
    string raw;

    try
    {
      raw = await aiClient.ChatCompletionAsync(SystemPrompt, userMessage, request.Model, ct);
    }
    catch (Exception ex)
    {
      logger.LogError(ex, "AI chat completion failed for prompt: {Prompt}", request.Prompt);
      return new AiDesignResponse { Success = false, Message = "AI service is temporarily unavailable." };
    }

    var (ir, validationErrors) = TryParseIr(raw, "generate");

    // Auto-repair: if validation failed, retry once with the errors
    if (ir is null && validationErrors is not null && !validationErrors.StartsWith("AI returned"))
    {
      logger.LogInformation("Attempting AI self-repair for validation errors");
      try
      {
        var repairPrompt = $"""
          Your previous output had these validation errors:
          {validationErrors}

          Fix ONLY the errors above and return the corrected COMPLETE JSON. No explanation, no markdown fences.
          Original request: {request.Prompt}
          Your previous (broken) output:
          {ExtractJson(raw)}
          """;

        var repairRaw = await aiClient.ChatCompletionAsync(SystemPrompt, repairPrompt, request.Model, ct);
        var (repairIr, _) = TryParseIr(repairRaw, "repair");
        if (repairIr is not null)
          ir = repairIr;
      }
      catch (Exception ex)
      {
        logger.LogWarning(ex, "AI self-repair attempt failed");
      }
    }

    if (ir is null)
      return new AiDesignResponse { Success = false, Message = "AI returned an invalid design. Please try rephrasing." };

    return new AiDesignResponse { Success = true, Ir = ir };
  }

  public async IAsyncEnumerable<AiStreamEvent> GenerateDesignStreamingAsync(
      AiDesignRequest request,
      [EnumeratorCancellation] CancellationToken ct = default)
  {
    var userMessage = BuildUserMessage(request);
    var buffer = new StringBuilder();

    await foreach (var chunk in aiClient.StreamChatCompletionAsync(SystemPrompt, userMessage, request.Model, ct))
    {
      buffer.Append(chunk);
      yield return new AiStreamEvent("chunk", chunk);
    }

    var raw = buffer.ToString();
    var (ir, validationErrors) = TryParseIr(raw, "streaming");

    // Auto-repair: if validation failed (not a JSON parse error), retry once
    if (ir is null && validationErrors is not null && !validationErrors.StartsWith("AI returned"))
    {
      logger.LogInformation("Attempting AI streaming self-repair for validation errors");
      try
      {
        var repairPrompt = $"""
          Your previous output had these validation errors:
          {validationErrors}

          Fix ONLY the errors above and return the corrected COMPLETE JSON. No explanation, no markdown fences.
          Original request: {request.Prompt}
          Your previous (broken) output:
          {ExtractJson(raw)}
          """;

        var repairRaw = await aiClient.ChatCompletionAsync(SystemPrompt, repairPrompt, request.Model, ct);
        var (repairIr, _) = TryParseIr(repairRaw, "streaming-repair");
        if (repairIr is not null)
          ir = repairIr;
      }
      catch (Exception ex)
      {
        logger.LogWarning(ex, "AI streaming self-repair attempt failed");
      }
    }

    if (ir is null)
    {
      yield return new AiStreamEvent("error", "AI returned an invalid design. Please try rephrasing.");
      yield break;
    }

    var irJson = JsonSerializer.Serialize(ir, JsonOptions);
    yield return new AiStreamEvent("result", irJson);
  }

  private static string BuildUserMessage(AiDesignRequest request)
  {
    var sb = new StringBuilder();
    sb.AppendLine(request.Prompt);
    sb.AppendLine();
    sb.AppendLine($"Target viewport width: {request.ViewportWidth}px.");

    if (request.ExistingIr is not null)
    {
      sb.AppendLine();
      sb.AppendLine("Current design on canvas (modify or extend it as needed):");
      sb.AppendLine(JsonSerializer.Serialize(request.ExistingIr, JsonOptions));
    }

    return sb.ToString();
  }

  private static void AssignSequentialIds(IRNode root)
  {
    var counter = 1;
    AssignIds(root, ref counter);

    static void AssignIds(IRNode node, ref int counter)
    {
      node.Id = counter++.ToString();
      foreach (var child in node.Children)
        AssignIds(child, ref counter);
    }
  }

  private const string IrSchemaReference = """

    ## IRNode Schema

    ```
    IRNode {
      id: string           // unique, will be reassigned — use "1","2","3"...
      type: string         // "Frame" | "Container" | "Text"  (use Container with backgroundImage for images)
      props: object        // key-value pairs.
                           // • Text nodes: { "text": "Hello" }
                           // • Sizing: use style.width/height — 100% for fill, px for fixed, { "value": 0, "unit": "fit-content" } to shrink-wrap
                           // • Links: { "href": "url", "linkType": "url", "target": "_blank" }
                           // • Image containers: {} (image URL goes in style.backgroundImage)
      layout?: IRLayout
      style?: IRStyle
      position?: IRPosition
      children: IRNode[]   // nested children
      meta: { name: string }  // descriptive name for the layer, e.g. "Hero Section", "Nav Bar"
    }
    ```

    ## Types
    - **Frame**: Top-level page container. Always the root node. One per design.
    - **Container**: Generic div/section. Use for grouping, rows, columns, cards, etc. **For images**, use a Container with `style.backgroundImage: "url(https://placehold.co/WxH)"`, `style.backgroundSize: "cover"`, `style.backgroundPosition: "center"`, `style.backgroundRepeat: "no-repeat"`. No `Image` type needed.
    - **Text**: Leaf node with text content in `props.text`. No children allowed.

    ## IRLayout
    ```
    {
      mode: "flex" | "grid" | "block"
      direction?: "row" | "column" | "rowReverse" | "columnReverse"   // Flex only
      align?: "start" | "center" | "end" | "stretch" | "baseline"
      justify?: "start" | "center" | "end" | "spaceBetween" | "spaceAround" | "spaceEvenly"
      gap?: IRLength
      rowGap?: IRLength
      columnGap?: IRLength
      wrap?: boolean
      columns?: number        // Grid only, must be >= 1
      rows?: number           // Grid only, must be >= 1
      gridTemplateColumns?: string   // e.g. "1fr 1fr 1fr"
      gridTemplateRows?: string
    }
    ```

    ## IRStyle
    ```
    {
      color?: string              // CSS color: "#ffffff", "rgba(0,0,0,0.5)", etc.
      background?: string         // CSS color for background
      backgroundImage?: string    // CSS url()
      backgroundSize?: string     // "cover", "contain", etc.
      backgroundPosition?: string // "center", "top left", etc.
      backgroundRepeat?: string   // "no-repeat", "repeat", etc.
      objectFit?: string          // For images: "cover", "contain", etc.

      width?: IRLength
      height?: IRLength
      minWidth?: IRLength
      maxWidth?: IRLength
      minHeight?: IRLength
      maxHeight?: IRLength

      fontSize?: IRLength         // e.g. { "value": 1, "unit": "rem" }
      fontWeight?: number         // 100, 200, 300, 400, 500, 600, 700, 800, or 900 only
      fontFamily?: string         // e.g. "Inter, sans-serif"
      fontStyle?: string          // "normal" | "italic"
      lineHeight?: IRLength
      letterSpacing?: IRLength
      textAlign?: string          // "left" | "center" | "right" | "justify"

      borderRadius?: IRLength
      border?: {
        width?: IRLength
        color?: string
        style: "solid" | "dashed" | "dotted" | "double" | "none"
      }

      overflow?: "visible" | "hidden" | "scroll" | "clip"
      shadows?: [{ "inset": bool, "x": number, "y": number, "blur": number, "spread": number, "color": string }]
      opacity?: number            // 0.0 to 1.0

      cursor?: string             // "pointer", "default", etc.

      padding?: { "top"?: IRLength, "right"?: IRLength, "bottom"?: IRLength, "left"?: IRLength }
      margin?: { "top"?: IRLength, "right"?: IRLength, "bottom"?: IRLength, "left"?: IRLength }
    }
    ```

    Where `IRLength = { "value": number, "unit": "px" | "%" | "rem" | "em" | "vw" | "vh" }`

    **CRITICAL**: IRLength is ALWAYS an object `{ "value": number, "unit": string }`.
    NEVER write a length as a plain string like "16px" or a bare number like 16.
    WRONG: `"fontSize": "16px"` or `"fontSize": 16`
    CORRECT: `"fontSize": { "value": 1, "unit": "rem" }`

    ## IRPosition
    ```
    {
      mode: "relative" | "absolute" | "fixed" | "sticky"
      // "relative" (DEFAULT): element participates in parent flex/grid flow — USE THIS for almost ALL children
      // "absolute": removed from flow, layered over parent content (overlays, badges, icons on cards)
      // "fixed": anchored to viewport, ignores scroll (floating button, cookie banner)
      // "sticky": sticks during scroll (navbars, section headings)
      top?: IRLength
      right?: IRLength
      bottom?: IRLength
      left?: IRLength
    }
    ```

    **CRITICAL position rule**: Every Container and Text node MUST have `"position": { "mode": "relative" }` UNLESS it is an overlay or special case. NEVER omit the position field on child nodes.

    ## Sizing Rules
    - **Fill width**: Set `"style": { "width": { "value": 100, "unit": "%" } }` when a Container or Text should span full parent width.
    - **Fill height**: Set `"style": { "height": { "value": 100, "unit": "%" } }` when a Container should fill remaining vertical space. No explicit `px` height needed.
    - **Fit-content width**: Set `"style": { "width": { "value": 0, "unit": "fit-content" } }` when a Container should shrink-wrap its children horizontally.
    - Fixed `px` widths — for cards, buttons, images, avatars, or fixed-size components.
    - Fixed `px` heights — for navbar, section containers, cards.
    - Centered page content: outer container `width: 100%` + flex column `align: "center"`, inner wrapper `width: 100%` + `maxWidth: { "value": 1200, "unit": "px" }`.
    - Reference heights: navbar 64px, hero section 640px, feature/content section 560px, card 380px, CTA section 360px, footer 220px.
    - Use `vw`/`vh` only on the root Frame.
    - For card grids: flex row with `wrap: true` and `gap`, or Grid with `gridTemplateColumns: "repeat(3, 1fr)"`.

    ## Text Rules — CRITICAL
    - Use EXACTLY ONE Text node per heading, subtitle, paragraph, or label. NEVER split a sentence or heading into multiple Text nodes.
    - BAD: three Text nodes "Welcome", "to Our", "Platform" stacked — they will OVERLAP.
    - GOOD: one Text node with `"text": "Welcome to Our Platform"`.
    - One Text node per "logical unit": page title, subtitle, body paragraph, button label, caption, badge, etc.
    - For a hero section: use 3–4 Text nodes max: (1) eyebrow badge, (2) headline, (3) subtext, (4) optional CTA button label.
    - **`props.text` MUST be a non-empty meaningful string.** Never output `""` or a filler word.
    - **Text node sizing**: Set `"style": { "width": { "value": 100, "unit": "%" } }` on headings, subtitles, and paragraphs — they will stretch to parent width. Inside a fixed-px button also add `height` equal to the button height.
    - **Text node height** (formula: `round(fontSize_rem × 16 × 1.4) + 8px buffer` — use these reference values):
      - 3.5–4rem heading → height 96–112px
      - 2.5–3rem subheading → height 72–88px
      - 1.5–2rem mid-size text → height 56–64px
      - 1–1.25rem body/nav link → height 40–48px
      - 0.75–0.875rem small label → height 28–36px
    - **NEVER generate `width: { "value": 0, "unit": "px" }` on any Container.** Use `style.width: 100%` for flex children that should expand.
    - **NEVER omit `layout.gap` on a flex Container with 2+ children** — zero-gap siblings squish together.

    ## Image Placeholder Rules — CRITICAL
    - For images: use a Container with `style.backgroundImage: "url(https://placehold.co/{W}x{H}.png)"` (ALWAYS add `.png` extension).
    - Always include `backgroundSize: "cover"`, `backgroundPosition: "center"`, `backgroundRepeat: "no-repeat"`.
    - Image containers MUST have explicit `width` and `height` in px. Example: `"url(https://placehold.co/600x400.png)"`.
    - Do NOT use `type: "Image"`. Do NOT use URLs without `.png`.

    ## Design Quality Guidelines
    - Use modern, premium SaaS aesthetics: generous whitespace, clear visual hierarchy, strong typography.
    - Use Flex layout primarily; Grid for card/feature grids.
    - All Containers and Frames MUST have a layout (default: Flex Column).
    - Root Frame: `width: 1280px`. Direct children use `width: 100%` and an explicit `height` in px.
    - Every child node MUST have `"position": { "mode": "relative" }` unless it is an absolute overlay.
    - Use `gap` of at least 16px between sibling elements. Use padding of 40–80px on section containers.
    - Cards: flex-column container (no gap) — image panel at top (fixed height ~200px) + text panel at bottom (fixed height ~160px, padding 20px). Total card height: 360px.
    - Buttons: Container (flex row, center+center, fixed width~160px, height~48px, borderRadius 24px, colored background) containing one Text node (button label).
    - Navbar: Container (flex row, spaceBetween, align center, `widthMode: fill`, height 64px, horizontal padding 40px) — logo Text on left, nav links row in center, action button on right.
    - Hero sections: large heading (3–5rem, fontWeight 700–800) + subtitle paragraph (1.125rem, fontWeight 400, muted color) + CTA button row. Use ample vertical padding (80–120px).
    - Give every node a descriptive meta.name.
    - Do NOT include Effects or Variants — only the base design.
    - Do NOT wrap the JSON in markdown code fences. Output ONLY raw JSON.
    - All enum values use camelCase: "flex", "column", "center", "spaceBetween", etc.
    - Colors must be valid CSS: hex (#fff, #ffffff), rgb(), rgba(), hsl(), or named colors.

    ## Minimal Valid Example

    ```json
    {
      "id": "1",
      "type": "Frame",
      "props": {},
      "layout": { "mode": "flex", "direction": "column", "align": "center", "justify": "start", "gap": { "value": 0, "unit": "px" } },
      "style": {
        "width": { "value": 1280, "unit": "px" },
        "minHeight": { "value": 100, "unit": "vh" },
        "background": "#0f172a"
      },
      "children": [
        {
          "id": "2", "type": "Container", "props": {},
          "position": { "mode": "relative" },
          "layout": { "mode": "flex", "direction": "row", "align": "center", "justify": "spaceBetween" },
          "style": {
            "width": { "value": 100, "unit": "%" }, "height": { "value": 64, "unit": "px" },
            "background": "#1e293b",
            "padding": { "left": { "value": 40, "unit": "px" }, "right": { "value": 40, "unit": "px" } }
          },
          "children": [
            { "id": "3", "type": "Text", "props": { "text": "Favigon" }, "position": { "mode": "relative" },
              "style": { "fontSize": { "value": 1.25, "unit": "rem" }, "fontWeight": 700, "color": "#f8fafc", "width": { "value": 120, "unit": "px" }, "height": { "value": 40, "unit": "px" } },
              "children": [], "meta": { "name": "Logo" } }
          ],
          "meta": { "name": "Navbar" }
        },
        {
          "id": "4", "type": "Container", "props": {},
          "position": { "mode": "relative" },
          "layout": { "mode": "flex", "direction": "column", "align": "center", "justify": "center", "gap": { "value": 24, "unit": "px" } },
          "style": {
            "width": { "value": 100, "unit": "%" }, "height": { "value": 640, "unit": "px" },
            "padding": { "top": { "value": 80, "unit": "px" }, "bottom": { "value": 80, "unit": "px" }, "left": { "value": 40, "unit": "px" }, "right": { "value": 40, "unit": "px" } }
          },
          "children": [
            { "id": "5", "type": "Text", "props": { "text": "Build beautiful products faster" }, "position": { "mode": "relative" },
              "style": { "width": { "value": 100, "unit": "%" }, "fontSize": { "value": 3.5, "unit": "rem" }, "fontWeight": 800, "color": "#f8fafc", "textAlign": "center", "height": { "value": 96, "unit": "px" } },
              "children": [], "meta": { "name": "Hero Headline" } },
            { "id": "6", "type": "Text", "props": { "text": "The design-to-code platform that keeps designers and developers in sync." }, "position": { "mode": "relative" },
              "style": { "width": { "value": 100, "unit": "%" }, "fontSize": { "value": 1.125, "unit": "rem" }, "fontWeight": 400, "color": "#94a3b8", "textAlign": "center", "height": { "value": 56, "unit": "px" }, "maxWidth": { "value": 560, "unit": "px" } },
              "children": [], "meta": { "name": "Hero Subtitle" } },
            { "id": "7", "type": "Container", "props": {},
              "position": { "mode": "relative" },
              "layout": { "mode": "flex", "direction": "row", "align": "center", "justify": "center", "gap": { "value": 12, "unit": "px" } },
              "style": { "width": { "value": 100, "unit": "%" }, "height": { "value": 48, "unit": "px" } },
              "children": [
                { "id": "8", "type": "Container", "props": {},
                  "position": { "mode": "relative" },
                  "layout": { "mode": "flex", "direction": "row", "align": "center", "justify": "center" },
                  "style": { "width": { "value": 148, "unit": "px" }, "height": { "value": 48, "unit": "px" }, "background": "#3b82f6", "borderRadius": { "value": 24, "unit": "px" } },
                  "children": [
                    { "id": "9", "type": "Text", "props": { "text": "Get Started" }, "position": { "mode": "relative" },
                      "style": { "width": { "value": 100, "unit": "%" }, "height": { "value": 48, "unit": "px" }, "fontSize": { "value": 0.875, "unit": "rem" }, "fontWeight": 600, "color": "#ffffff", "textAlign": "center" },
                      "children": [], "meta": { "name": "CTA Label" } }
                  ], "meta": { "name": "CTA Button" } }
              ], "meta": { "name": "CTA Row" } }
          ],
          "meta": { "name": "Hero Section" }
        },
        {
          "id": "10", "type": "Container", "props": {},
          "position": { "mode": "relative" },
          "layout": { "mode": "flex", "direction": "row", "align": "start", "justify": "center", "gap": { "value": 24, "unit": "px" }, "wrap": true },
          "style": {
            "width": { "value": 100, "unit": "%" }, "height": { "value": 480, "unit": "px" },
            "background": "#1e293b",
            "padding": { "top": { "value": 60, "unit": "px" }, "bottom": { "value": 60, "unit": "px" }, "left": { "value": 60, "unit": "px" }, "right": { "value": 60, "unit": "px" } }
          },
          "children": [
            { "id": "11", "type": "Container", "props": {},
              "position": { "mode": "relative" },
              "layout": { "mode": "flex", "direction": "column", "align": "start", "justify": "start" },
              "style": { "width": { "value": 340, "unit": "px" }, "height": { "value": 360, "unit": "px" }, "background": "#0f172a", "borderRadius": { "value": 12, "unit": "px" }, "overflow": "hidden" },
              "children": [
                { "id": "12", "type": "Container", "props": {},
                  "position": { "mode": "relative" },
                  "style": { "width": { "value": 340, "unit": "px" }, "height": { "value": 200, "unit": "px" }, "backgroundImage": "url(https://placehold.co/340x200.png)", "backgroundSize": "cover", "backgroundPosition": "center", "backgroundRepeat": "no-repeat" },
                  "children": [], "meta": { "name": "Card Image" } },
                { "id": "13", "type": "Container", "props": {},
                  "position": { "mode": "relative" },
                  "layout": { "mode": "flex", "direction": "column", "align": "start", "justify": "center", "gap": { "value": 8, "unit": "px" } },
                  "style": { "width": { "value": 340, "unit": "px" }, "height": { "value": 160, "unit": "px" }, "padding": { "top": { "value": 20, "unit": "px" }, "bottom": { "value": 20, "unit": "px" }, "left": { "value": 20, "unit": "px" }, "right": { "value": 20, "unit": "px" } } },
                  "children": [
                    { "id": "14", "type": "Text", "props": { "text": "Feature Title" }, "position": { "mode": "relative" },
                      "style": { "width": { "value": 100, "unit": "%" }, "fontSize": { "value": 1.125, "unit": "rem" }, "fontWeight": 600, "color": "#f8fafc", "height": { "value": 40, "unit": "px" } },
                      "children": [], "meta": { "name": "Card Title" } },
                    { "id": "15", "type": "Text", "props": { "text": "Short description of this feature." }, "position": { "mode": "relative" },
                      "style": { "width": { "value": 100, "unit": "%" }, "fontSize": { "value": 0.875, "unit": "rem" }, "fontWeight": 400, "color": "#94a3b8", "height": { "value": 40, "unit": "px" } },
                      "children": [], "meta": { "name": "Card Description" } }
                  ], "meta": { "name": "Card Body" } }
              ], "meta": { "name": "Feature Card" } }
          ],
          "meta": { "name": "Features Section" }
        }
      ],
      "meta": { "name": "Page Frame" }
    }
    ```
    """;

  private static readonly string SystemPrompt = $$"""
    You are a UI design assistant for Favigon, a design-to-code platform.
    You create and modify UI designs represented as an IR (Intermediate Representation) JSON tree.

    When the user provides a "Current design on canvas", modify or extend it according to the request.
    When no current design is provided, generate a fresh design from scratch.
    Always return the COMPLETE design — the full root IRNode with all children.

    CRITICAL RULES:
    1. Output ONLY a single valid JSON object — the root IRNode. NO markdown, NO explanation, NO code fences.
    2. Every IRLength MUST be an object: { "value": number, "unit": string }. NEVER use plain strings like "16px".
    3. All enum values MUST be camelCase: "flex", "column", "center", "spaceBetween", etc.
    4. Text nodes MUST have children: [].
    5. Every node MUST have a meta with name.
    6. fontWeight MUST be a multiple of 100 between 100-900.
    7. Colors MUST be valid CSS (#hex, rgb(), rgba(), hsl(), named).
    8. The root node MUST be type "Frame".
    9. Every child node (Container, Text) inside a flex/grid parent MUST have `"position": { "mode": "relative" }`.
    10. Every Container node with fixed `px` height MUST declare that height. Containers that fill remaining height use `height: 100%` in style — no `px` height needed.
    11. NEVER split a heading or sentence across multiple Text nodes — ONE Text node per logical text unit.
    12. Image placeholder URLs MUST end with `.png`: `url(https://placehold.co/WxH.png)`.
    13. NEVER use `width: { "value": 0, "unit": "px" }` on any node. Use `style.width: 100%` for flex children that should expand.
    14. Text nodes for headings/subtitles/paragraphs MUST have `style.width: 100%`. Height MUST match font size: 3.5–4rem→96–112px, 2.5–3rem→80–96px, 1.5–2rem→56–72px, 1–1.25rem→40–48px, 0.75–0.875rem→28–36px. Text nodes INSIDE a fixed-px button: use `width: 100%` + `height` matching the button height.
    15. A row Container that wraps buttons/CTAs MUST NOT have a fixed-px width narrower than its children. Either omit `style.width` entirely (yoga auto-fits) or set `style.width: 100%`. NEVER set a narrow fixed-px width.
    16. Every flex Container with 2 or more children MUST declare `layout.gap` (minimum `{ "value": 8, "unit": "px" }`). NEVER omit gap — children will squish together without it.
    17. `props.text` on every Text node MUST be a non-empty string with real content. NEVER output an empty or placeholder text like "" or "text".

    Follow the example format in the schema EXACTLY.
    {{IrSchemaReference}}
    """;
}
