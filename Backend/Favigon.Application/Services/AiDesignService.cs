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
      raw = await aiClient.ChatCompletionAsync(SystemPrompt, userMessage, ct);
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

        var repairRaw = await aiClient.ChatCompletionAsync(SystemPrompt, repairPrompt, ct);
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

    await foreach (var chunk in aiClient.StreamChatCompletionAsync(SystemPrompt, userMessage, ct))
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

        var repairRaw = await aiClient.ChatCompletionAsync(SystemPrompt, repairPrompt, ct);
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
      type: string         // "Frame" | "Container" | "Text" | "Image"
      props: object        // key-value pairs. Text nodes: { "text": "Hello" }. Image nodes: { "src": "https://placehold.co/WxH", "alt": "desc" }. Links: { "href": "url" }
      layout?: IRLayout
      style?: IRStyle
      position?: IRPosition
      children: IRNode[]   // nested children
      meta: { name: string }  // descriptive name for the layer, e.g. "Hero Section", "Nav Bar"
    }
    ```

    ## Types
    - **Frame**: Top-level page container. Always the root node. One per design.
    - **Container**: Generic div/section. Use for grouping, rows, columns, cards, etc.
    - **Text**: Leaf node with text content in `props.text`. No children allowed.
    - **Image**: Leaf node with `props.src` and `props.alt`. No children allowed. Use https://placehold.co/WxH for placeholder images.

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

    **CRITICAL position rule**: Every Container and Text/Image node MUST have `"position": { "mode": "relative" }` UNLESS it is an overlay or special case. NEVER omit the position field on child nodes.

    ## Sizing Rules
    - `width: { "value": 100, "unit": "%" }` — fills full parent width. Use for page sections, rows, wrappers.
    - `width: { "value": 50, "unit": "%" }` — half the parent. Use for two-column splits.
    - Fixed `px` widths — for cards, buttons, images, or fixed-size components.
    - Centered page content: outer container `width: 100%` + flex column `align: "center"`, inner wrapper `width: 100%` + `maxWidth: { "value": 1200, "unit": "px" }`.
    - **ALWAYS set explicit `height` in `px` on every Container node** — this is required for the canvas to display it. NEVER rely on minHeight alone.
    - Optionally also add `minHeight` as a CSS hint, but `height` MUST be present.
    - Reference heights: navbar 80px, hero section 800px, feature/content section 600px, card 320px, CTA section 400px, footer 260px.
    - Use `vw`/`vh` only on the root Frame (e.g., `minHeight: { "value": 100, "unit": "vh" }`).
    - For responsive card/feature grids: flex row with `wrap: true` and `gap`, or Grid with `gridTemplateColumns: "repeat(3, 1fr)"`.

    ## Design Guidelines
    - Use modern, clean design. Think premium SaaS landing pages.
    - Use Flex layout primarily. Use Grid for card grids or multi-column content.
    - All Containers and Frames MUST have a layout (default: Flex Column).
    - Root Frame: `width: 1280px`, `minHeight: 100vh`. Direct children use `width: 100%` and an explicit `height` in px.
    - Every child node MUST have `"position": { "mode": "relative" }` unless it is an overlay/badge/floating element.
    - Use `position: { "mode": "absolute" }` only for elements that visually overlap their parent (overlays, floating badges).
    - Use `wrap: true` in flex rows that should wrap on smaller screens.
    - Use rem for font sizes, px for padding/gap/border-radius.
    - Pick a cohesive color palette. Dark background + light text OR light background + dark text.
    - Add padding to containers for breathing room (16–48px typical).
    - Give every node a descriptive meta.name.
    - Text nodes MUST have props.text. Image nodes MUST have props.src and props.alt.
    - Text and Image nodes MUST have an empty children array [].
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
      "layout": {
        "mode": "flex",
        "direction": "column",
        "align": "center",
        "justify": "start",
        "gap": { "value": 24, "unit": "px" }
      },
      "style": {
        "width": { "value": 1280, "unit": "px" },
        "minHeight": { "value": 100, "unit": "vh" },
        "background": "#0f172a",
        "padding": {
          "top": { "value": 48, "unit": "px" },
          "right": { "value": 24, "unit": "px" },
          "bottom": { "value": 48, "unit": "px" },
          "left": { "value": 24, "unit": "px" }
        }
      },
      "children": [
        {
          "id": "2",
          "type": "Text",
          "props": { "text": "Welcome" },
          "position": { "mode": "relative" },
          "style": {
            "fontSize": { "value": 2.5, "unit": "rem" },
            "fontWeight": 700,
            "color": "#f8fafc"
          },
          "children": [],
          "meta": { "name": "Heading" }
        },
        {
          "id": "3",
          "type": "Container",
          "props": {},
          "position": { "mode": "relative" },
          "layout": {
            "mode": "flex",
            "direction": "row",
            "align": "center",
            "justify": "center",
            "gap": { "value": 16, "unit": "px" }
          },
          "style": {
            "width": { "value": 100, "unit": "%" },
            "height": { "value": 400, "unit": "px" }
          },
          "children": [
            {
              "id": "4",
              "type": "Image",
              "props": { "src": "https://placehold.co/300x200", "alt": "Placeholder" },
              "position": { "mode": "relative" },
              "style": {
                "width": { "value": 300, "unit": "px" },
                "height": { "value": 200, "unit": "px" },
                "borderRadius": { "value": 8, "unit": "px" }
              },
              "children": [],
              "meta": { "name": "Hero Image" }
            }
          ],
          "meta": { "name": "Image Row" }
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
    4. Text and Image nodes MUST have children: [].
    5. Every node MUST have a meta with name.
    6. fontWeight MUST be a multiple of 100 between 100-900.
    7. Colors MUST be valid CSS (#hex, rgb(), rgba(), hsl(), named).
    8. The root node MUST be type "Frame".
    9. Every child node (Container, Text, Image) inside a flex/grid parent MUST have `"position": { "mode": "relative" }`.
    10. Every Container node MUST have an explicit `height` in `px`. NEVER omit the height field on a Container.

    Follow the example format in the schema EXACTLY.
    {{IrSchemaReference}}
    """;
}
