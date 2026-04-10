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
      var label = string.IsNullOrWhiteSpace(page.PageName) ? $"{page.ViewportWidth}px" : $"{page.PageName} – {page.ViewportWidth}px";
      var diffCss = converterEngine.GenerateDiffCss(sorted[0].Ir, page.Ir, framework, page.ViewportWidth, label);
      if (!string.IsNullOrWhiteSpace(diffCss))
        sb.Append(diffCss);
    }

    return new ConverterResponse { Framework = framework, IsValid = true, Html = html, Css = sb.ToString() };
  }

  public bool Validate(IRNode root) => converterEngine.Validate(root);

  public MultiPageConverterResponse GenerateMultiPage(List<ConverterPageInput> pages, string framework)
  {
    if (pages.Count == 0)
      throw new ArgumentException("At least one page is required.");

    foreach (var page in pages)
      if (!converterEngine.Validate(page.Ir))
        throw new InvalidOperationException($"IR validation failed for page '{page.PageName}'.");

    var entries = pages.Select(p => (p.PageName, p.ViewportWidth, p.Ir));
    var files = converterEngine.GenerateMultiPage(entries, framework);

    return new MultiPageConverterResponse
    {
      Framework = framework,
      IsValid = true,
      Files = files.Select(f => new GeneratedFileDto { Path = f.Path, Content = f.Content }).ToList()
    };
  }
}
