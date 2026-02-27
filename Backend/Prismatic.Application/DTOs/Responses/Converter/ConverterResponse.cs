namespace Prismatic.Application.DTOs.Responses;

public class ConverterResponse
{
  public string Framework { get; set; } = string.Empty;
  public string? Flavor { get; set; }
  public string Html { get; set; } = string.Empty;
  public string Css { get; set; } = string.Empty;
}

public class ConverterValidationResponse
{
  public bool IsValid { get; set; }
  public IEnumerable<ConverterValidationError> Errors { get; set; } = [];
}

public class ConverterValidationError
{
  public string Path { get; set; } = string.Empty;
  public string Message { get; set; } = string.Empty;
}
