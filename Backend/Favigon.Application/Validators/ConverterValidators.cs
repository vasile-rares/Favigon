using Favigon.Application.DTOs.Requests;
using FluentValidation;

namespace Favigon.Application.Validators;

public class ConverterGenerateValidator : AbstractValidator<ConverterRequest>
{
  public ConverterGenerateValidator()
  {
    RuleFor(x => x.Framework)
        .NotEmpty()
        .WithMessage("Framework is required.");

    RuleFor(x => x)
        .Must(x => x.Ir is not null || x.Pages is { Count: > 1 })
        .WithMessage("Either 'ir' or 'pages' (2+ entries) is required.");
  }
}

public class ConverterValidateValidator : AbstractValidator<ConverterRequest>
{
  public ConverterValidateValidator()
  {
    RuleFor(x => x.Ir)
        .NotNull()
        .WithMessage("IR node is required.");
  }
}

public class ConverterGenerateFilesValidator : AbstractValidator<ConverterRequest>
{
  public ConverterGenerateFilesValidator()
  {
    RuleFor(x => x.Pages)
        .NotNull()
        .Must(p => p is { Count: > 0 })
        .WithMessage("'pages' (1+ entries) is required for multi-page generation.");
  }
}
