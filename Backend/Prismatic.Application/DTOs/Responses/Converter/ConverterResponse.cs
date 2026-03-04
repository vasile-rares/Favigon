namespace Prismatic.Application.DTOs.Responses;

public class ConverterResponse
{
  public string Framework { get; set; } = string.Empty;
  public string? Flavor { get; set; }
  public bool IsSuccess { get; set; }
  public bool IsValid { get; set; }
  public string Html { get; set; } = string.Empty;
  public string Css { get; set; } = string.Empty;
}
