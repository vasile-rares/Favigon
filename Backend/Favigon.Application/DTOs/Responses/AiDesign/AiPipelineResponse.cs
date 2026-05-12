using Favigon.Converter.Models;

namespace Favigon.Application.DTOs.Responses;

public class AiPipelineResponse
{
  public bool Success { get; set; }
  public string? Message { get; set; }
  public IntentBlueprint? Intent { get; set; }
  public IRNode? Structure { get; set; }
  public IRNode? Ir { get; set; }
}
