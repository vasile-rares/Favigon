using System.Text;
using Favigon.Application.DTOs.Requests;
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

  public ConverterResponse GenerateResponsive(List<ConverterPageInput> pages, string framework)
  {
    if (pages.Count == 0)
      throw new ArgumentException("At least one page is required.");

    var sorted = pages.OrderByDescending(p => p.ViewportWidth).ToList();

    foreach (var page in sorted)
      if (!converterEngine.Validate(page.Ir))
        throw new InvalidOperationException($"IR validation failed for page '{page.PageName}'.");

    var (html, baseCss) = converterEngine.Generate(sorted[0].Ir, framework);

    if (sorted.Count == 1)
      return new ConverterResponse { Framework = framework, IsValid = true, Html = html, Css = baseCss };

    var sb = new StringBuilder(baseCss);

    foreach (var page in sorted.Skip(1))
    {
      var (_, pageCss) = converterEngine.Generate(page.Ir, framework);
      if (string.IsNullOrWhiteSpace(pageCss)) continue;

      sb.Append('\n');
      var label = string.IsNullOrWhiteSpace(page.PageName) ? $"{page.ViewportWidth}px" : $"{page.PageName} – {page.ViewportWidth}px";
      sb.Append($"/* {label} */\n");
      sb.Append($"@media (max-width: {page.ViewportWidth}px) {{\n");
      foreach (var line in pageCss.TrimEnd().Split('\n'))
        sb.Append($"  {line}\n");
      sb.Append("}\n");
    }

    return new ConverterResponse { Framework = framework, IsValid = true, Html = html, Css = sb.ToString() };
  }

  public bool Validate(IRNode root) => converterEngine.Validate(root);
}
