using Favigon.Converter.Models;

namespace Favigon.Converter.Abstractions;

public record GeneratedFile(string Path, string Content);

public interface IConverterEngine
{
  (string Html, string Css) GenerateFromCanvas(string canvasJson, string framework);
  (string Html, string Css) GenerateSinglePage(IRNode root, string framework);
  List<GeneratedFile> GenerateMultiPage(IEnumerable<(string PageName, int ViewportWidth, IRNode Ir)> pages, string framework);
  /// <summary>Returns a @media diff block containing only the CSS properties that differ between primary and breakpoint.</summary>
  string GenerateDiffCss(IRNode primary, IRNode breakpoint, string framework, int maxWidth, string label);
  /// <summary>
  /// Generates responsive HTML + CSS from a list of pages sorted descending by viewport width.
  /// Exclusive breakpoint nodes are appended to the HTML hidden by default and revealed in their
  /// @media block. Primary-only nodes receive <c>display: none</c> in each breakpoint's @media block.
  /// </summary>
  (string Html, string Css) GenerateResponsiveOutput(IReadOnlyList<(IRNode Ir, int ViewportWidth, string Label)> sortedDescending, string framework);
  bool Validate(IRNode root);
  IRNode ParseCanvas(string canvasJson);
}
