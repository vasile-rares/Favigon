using System.Text.Json;
using System.Text.Json.Serialization;
using Favigon.Application.DTOs.Requests;
using Favigon.Application.DTOs.Responses;
using Favigon.Application.Interfaces;
using Microsoft.Extensions.Logging;

namespace Favigon.Application.Services;

/// <summary>
/// Phase 1 — Intent Analysis.
/// Reads the user prompt and produces an IntentBlueprint: what sections the page needs,
/// the visual mood, and the brand personality. No design decisions are made here.
/// </summary>
public sealed class AiIntentService(IAiClient aiClient, ILogger<AiIntentService> logger)
{
  // JSON schema sent to the AI as response_format (structured output).
  private const string IntentSchema = """
    {
      "$schema": "http://json-schema.org/draft-07/schema#",
      "title": "IntentBlueprint",
      "type": "object",
      "required": ["pageType", "colorMood", "brandPersonality", "targetAudience", "primaryCta", "sections"],
      "properties": {
        "pageType": {
          "type": "string",
          "enum": ["landing", "dashboard", "auth", "blog", "portfolio", "ecommerce", "docs", "other"]
        },
        "colorMood": {
          "type": "string",
          "enum": ["professional", "playful", "minimal", "bold", "elegant", "dark", "vibrant"]
        },
        "brandPersonality": { "type": "string" },
        "targetAudience": { "type": "string" },
        "primaryCta": { "type": "string" },
        "sections": {
          "type": "array",
          "items": {
            "type": "object",
            "required": ["name", "purpose", "layoutHint", "order"],
            "properties": {
              "name": { "type": "string" },
              "purpose": { "type": "string" },
              "layoutHint": {
                "type": "string",
                "enum": [
                  "horizontal-bar",
                  "full-width-centered",
                  "two-column-split",
                  "card-grid-2",
                  "card-grid-3",
                  "card-grid-4",
                  "single-column",
                  "multi-column-footer",
                  "dashboard-sidebar",
                  "form-centered",
                  "testimonial-row"
                ]
              },
              "order": { "type": "integer", "minimum": 1 }
            }
          },
          "minItems": 2,
          "maxItems": 8
        }
      },
      "additionalProperties": false
    }
    """;

  private const string SystemPrompt = """
    You are a UX strategist for Favigon, a design-to-code platform.

    Analyze the user's UI request and produce a structured IntentBlueprint.
    This is a PLANNING step only — zero design decisions.

    Your blueprint defines:
    - pageType: classify the page category.
    - colorMood: the visual mood that fits the brand.
    - brandPersonality: one sentence describing the product/brand based on the request.
    - targetAudience: who this page is for (one sentence).
    - primaryCta: the main call-to-action button text.
    - sections: ordered list (1-based "order") of sections the page needs, each with:
        - name: section name (Navbar, Hero, Features, Benefits, Pricing, Testimonials, FAQ, CTA, Footer, etc.)
        - purpose: one sentence why this section is on the page
        - layoutHint: the layout pattern that suits this section (must be one of the allowed enum values)
        - order: position in the page (1-based, ascending)

    Section rules:
    - Every page MUST start with a Navbar (horizontal-bar) and end with a Footer (multi-column-footer).
    - Landing page: Navbar → Hero (full-width-centered or two-column-split) → Features (card-grid-3) → [Testimonials] → CTA (full-width-centered) → Footer.
    - Dashboard: Navbar (horizontal-bar) → Dashboard body (dashboard-sidebar).
    - Auth: Navbar (horizontal-bar) → Form (form-centered) → Footer.
    - Include only sections relevant to the specific request. Max 8 sections.

    Output ONLY valid JSON — no explanation, no markdown, no code fences.
    """;

  private static readonly JsonSerializerOptions JsonOptions = new()
  {
    PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
    DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
  };

  public async Task<(IntentBlueprint? blueprint, string? error)> GenerateAsync(
      AiPipelineRequest request,
      CancellationToken ct = default)
  {
    string raw;
    try
    {
      raw = await aiClient.ChatCompletionAsync(SystemPrompt, request.Prompt, request.Model, IntentSchema, ct);
    }
    catch (Exception ex)
    {
      logger.LogError(ex, "[Phase 1] AI call failed for prompt: {Prompt}", request.Prompt);
      return (null, "AI service is temporarily unavailable.");
    }

    logger.LogDebug("[Phase 1] Raw response ({Length} chars): {Raw}", raw.Length, raw[..Math.Min(raw.Length, 500)]);

    var json = AiIrHelper.ExtractJson(raw);

    IntentBlueprint? blueprint;
    try
    {
      blueprint = JsonSerializer.Deserialize<IntentBlueprint>(json, JsonOptions);
    }
    catch (JsonException ex)
    {
      logger.LogError(ex, "[Phase 1] Failed to parse blueprint JSON: {Json}", json[..Math.Min(json.Length, 500)]);
      return (null, "AI returned an invalid intent blueprint.");
    }

    if (blueprint is null || blueprint.Sections.Count == 0)
      return (null, "AI returned an empty intent blueprint.");

    logger.LogInformation("[Phase 1] Blueprint: {PageType}, {Mood}, {Count} sections",
        blueprint.PageType, blueprint.ColorMood, blueprint.Sections.Count);

    return (blueprint, null);
  }
}
