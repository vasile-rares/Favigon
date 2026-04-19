using Favigon.Converter.Models;

namespace Favigon.Application.DTOs.Responses;

public class AiDesignResponse
{
  public bool Success { get; set; }
  public IRNode? Ir { get; set; }
  public string? Message { get; set; }
}
