namespace Prismatic.Application.DTOs.Responses;

public class CodeGenResponse
{
  public string Framework { get; set; } = string.Empty;
  public string? Flavor { get; set; }
  public string Html { get; set; } = string.Empty;
  public string Css { get; set; } = string.Empty;
}

public class CodeGenValidationResponse
{
  public bool IsValid { get; set; }
  public IEnumerable<CodeGenValidationError> Errors { get; set; } = [];
}

public class CodeGenValidationError
{
  public string Path { get; set; } = string.Empty;
  public string Message { get; set; } = string.Empty;
}
