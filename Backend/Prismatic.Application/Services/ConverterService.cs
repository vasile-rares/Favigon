using Prismatic.Application.Interfaces;
using Prismatic.Application.DTOs.Responses;
using Prismatic.Converter.Abstractions;
using Prismatic.Converter.Models;

namespace Prismatic.Application.Services;

public class ConverterService(IConverterEngine converterEngine) : IConverterService
{
  public ConverterResponse Generate(IRNode root, string framework)
  {
    if (!converterEngine.Validate(root))
      throw new InvalidOperationException("IR validation failed.");

    var output = converterEngine.Generate(root, framework);
    return new ConverterResponse
    {
      Framework = framework,
      IsValid = true,
      Html = output.Html,
      Css = output.Css
    };
  }

  public bool Validate(IRNode root) => converterEngine.Validate(root);
}
