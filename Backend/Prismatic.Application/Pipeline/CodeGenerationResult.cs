using Prismatic.Domain.IR;

namespace Prismatic.Application.Pipeline;

/// <summary>
/// Result of a <see cref="CodeGenerationPipeline.Generate"/> call.
/// </summary>
public sealed class CodeGenerationResult
{
  public bool IsSuccess { get; private init; }

  /// <summary>Generated HTML markup (anchor comments included).</summary>
  public string? Html { get; private init; }

  /// <summary>Generated CSS (class-based rules + @media queries).</summary>
  public string? Css { get; private init; }

  public string? ErrorMessage { get; private init; }
  public IRValidationResult ValidationResult { get; private init; } = null!;

  public static CodeGenerationResult Success(string html, string css, IRValidationResult validation) =>
      new() { IsSuccess = true, Html = html, Css = css, ValidationResult = validation };

  public static CodeGenerationResult Invalid(IRValidationResult validation) =>
      new()
      {
        IsSuccess = false,
        ErrorMessage = validation.ToString(),
        ValidationResult = validation
      };

  public static CodeGenerationResult Failure(string message, IRValidationResult validation) =>
      new() { IsSuccess = false, ErrorMessage = message, ValidationResult = validation };

  public override string ToString() =>
      IsSuccess ? $"OK (html: {Html?.Length ?? 0} chars, css: {Css?.Length ?? 0} chars)" : $"FAILED: {ErrorMessage}";
}
