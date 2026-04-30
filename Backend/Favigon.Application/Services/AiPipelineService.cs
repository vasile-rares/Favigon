using System.Runtime.CompilerServices;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Favigon.Application.DTOs.Requests;
using Favigon.Application.DTOs.Responses;
using Favigon.Application.Interfaces;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Logging;

namespace Favigon.Application.Services;

/// <summary>
/// Orchestrates the three-phase AI design pipeline:
///   Phase 1 (AiIntentService)   — Analyzes the prompt → IntentBlueprint
///   Phase 2 (AiStructureService) — Builds the layout wireframe → structural IRNode
///   Phase 3 (AiStyleService)    — Applies the design system → fully styled IRNode
/// </summary>
public sealed class AiPipelineService(
    AiIntentService intentService,
    AiStructureService structureService,
    AiStyleService styleService,
    IMemoryCache cache,
    ILogger<AiPipelineService> logger) : IAiPipelineService
{
  private static readonly TimeSpan CacheTtl = TimeSpan.FromMinutes(10);

  private static string BuildCacheKey(AiPipelineRequest r)
  {
    var raw = $"pipeline|{r.Prompt}|{r.ViewportWidth}|{r.Model ?? ""}|{r.StopAfterPhase}";
    return Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(raw)));
  }

  public async Task<AiPipelineResponse> RunPipelineAsync(
      AiPipelineRequest request,
      CancellationToken ct = default)
  {
    var key = BuildCacheKey(request);
    if (cache.TryGetValue(key, out AiPipelineResponse? cached))
    {
      logger.LogDebug("[Cache HIT] pipeline key={Key}", key[..8]);
      return cached!;
    }

    // ── Phase 1: Intent ────────────────────────────────────────────────────
    logger.LogInformation("[Pipeline] Phase 1 — analyzing intent for: {Prompt}", request.Prompt[..Math.Min(request.Prompt.Length, 80)]);

    var (blueprint, intentError) = await intentService.GenerateAsync(request, ct);
    if (blueprint is null)
      return Fail(intentError ?? "Intent analysis failed.");

    if (request.StopAfterPhase == 1)
    {
      var r = new AiPipelineResponse { Success = true, Intent = blueprint };
      cache.Set(key, r, CacheTtl);
      return r;
    }

    // ── Phase 2: Structure ─────────────────────────────────────────────────
    logger.LogInformation("[Pipeline] Phase 2 — building structure ({Sections} sections)", blueprint.Sections.Count);

    var (structure, structureError) = await structureService.GenerateAsync(request, blueprint, ct);
    if (structure is null)
      return Fail(structureError ?? "Structure generation failed.");

    if (request.StopAfterPhase == 2)
    {
      var r = new AiPipelineResponse { Success = true, Intent = blueprint, Structure = structure };
      cache.Set(key, r, CacheTtl);
      return r;
    }

    // ── Phase 3: Style ─────────────────────────────────────────────────────
    logger.LogInformation("[Pipeline] Phase 3 — applying design system ({Mood} mood)", blueprint.ColorMood);

    var (styledIr, styleError) = await styleService.ApplyStyleAsync(request, blueprint, structure, ct);
    if (styledIr is null)
      return Fail(styleError ?? "Style application failed.");

    logger.LogInformation("[Pipeline] Complete — 3-phase pipeline finished successfully.");
    var result = new AiPipelineResponse
    {
      Success = true,
      Intent = blueprint,
      Structure = structure,
      Ir = styledIr
    };
    cache.Set(key, result, CacheTtl);
    return result;
  }

  public async IAsyncEnumerable<AiStreamEvent> RunPipelineStreamingAsync(
      AiPipelineRequest request,
      [EnumeratorCancellation] CancellationToken ct = default)
  {
    // ── Phase 1 ────────────────────────────────────────────────────────────
    yield return PhaseStart(1, "Analyzing your request...");

    var (blueprint, intentError) = await intentService.GenerateAsync(request, ct);
    if (blueprint is null)
    {
      yield return new AiStreamEvent("error", intentError ?? "Intent analysis failed.");
      yield break;
    }

    yield return PhaseComplete(1, JsonSerializer.Serialize(blueprint, AiIrHelper.JsonOptions));

    if (request.StopAfterPhase == 1)
    {
      yield return new AiStreamEvent("result", JsonSerializer.Serialize(
          new AiPipelineResponse { Success = true, Intent = blueprint },
          AiIrHelper.JsonOptions));
      yield break;
    }

    // ── Phase 2 ────────────────────────────────────────────────────────────
    yield return PhaseStart(2, "Building page structure...");

    var (structure, structureError) = await structureService.GenerateAsync(request, blueprint, ct);
    if (structure is null)
    {
      yield return new AiStreamEvent("error", structureError ?? "Structure generation failed.");
      yield break;
    }

    yield return PhaseComplete(2, JsonSerializer.Serialize(structure, AiIrHelper.JsonOptions));

    if (request.StopAfterPhase == 2)
    {
      yield return new AiStreamEvent("result", JsonSerializer.Serialize(
          new AiPipelineResponse { Success = true, Intent = blueprint, Structure = structure },
          AiIrHelper.JsonOptions));
      yield break;
    }

    // ── Phase 3 ────────────────────────────────────────────────────────────
    yield return PhaseStart(3, "Applying design system...");

    var (styledIr, styleError) = await styleService.ApplyStyleAsync(request, blueprint, structure, ct);
    if (styledIr is null)
    {
      yield return new AiStreamEvent("error", styleError ?? "Style application failed.");
      yield break;
    }

    yield return PhaseComplete(3, null);

    yield return new AiStreamEvent("result", JsonSerializer.Serialize(
        new AiPipelineResponse { Success = true, Intent = blueprint, Structure = structure, Ir = styledIr },
        AiIrHelper.JsonOptions));
  }

  private static AiStreamEvent PhaseStart(int phase, string label) =>
      new("phase_start", JsonSerializer.Serialize(new { phase, label }));

  private static AiStreamEvent PhaseComplete(int phase, string? data) =>
      new("phase_complete", JsonSerializer.Serialize(new { phase, data }));

  private static AiPipelineResponse Fail(string message) =>
      new() { Success = false, Message = message };
}
