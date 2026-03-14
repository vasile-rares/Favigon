namespace Favigon.Application.DTOs.Responses;

public class ConverterResponse
{
  public string Framework { get; set; } = string.Empty;
  public bool IsValid { get; set; }
  public string Html { get; set; } = string.Empty;
  public string Css { get; set; } = string.Empty;
}
