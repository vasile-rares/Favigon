using Favigon.Converter.Models;

namespace Favigon.Application.DTOs.Responses;

public class AiPipelineResponse
{
  public bool Success { get; set; }
  public string? Message { get; set; }

  /// <summary>Phase 1 output — always present on success.</summary>
  public IntentBlueprint? Intent { get; set; }

  /// <summary>Phase 2 output — layout-correct structural tree, no visual decoration. Present when StopAfterPhase >= 2.</summary>
  public IRNode? Structure { get; set; }

  /// <summary>Phase 3 output — fully styled IRNode. Present when StopAfterPhase == 3.</summary>
  public IRNode? Ir { get; set; }
}
