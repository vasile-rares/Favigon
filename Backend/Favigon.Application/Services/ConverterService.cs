using Favigon.Application.Interfaces;
using Favigon.Application.DTOs.Responses;
using Favigon.Converter.Abstractions;
using Favigon.Converter.Models;

namespace Favigon.Application.Services;

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
