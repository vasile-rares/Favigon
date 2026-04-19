using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using Favigon.Converter.Abstractions;
using Favigon.Converter.Generators.Angular;
using Favigon.Converter.Generators.Html;
using Favigon.Converter.Generators.React;
using Favigon.Converter.Models;
using Favigon.Converter.Parsers.Canvas;
using Favigon.Converter.Transformers;
using Favigon.Converter.Utils;
using Favigon.Converter.Validation;

namespace Favigon.Converter;

public sealed class ConverterEngine : IConverterEngine
{
  private sealed record GeneratedPageArtifacts(
    string Html,
    string Css,
    IRNode ExportRoot,
    IReadOnlyDictionary<string, NodeCssClasses> CssClassMap,
    StyleBuilder Styles);

  private static readonly CanvasParser CanvasParser = new();

  private static readonly IReadOnlyDictionary<string, IReadOnlyDictionary<string, IComponentMapper>> FrameworkMappers =
    new Dictionary<string, IReadOnlyDictionary<string, IComponentMapper>>(StringComparer.OrdinalIgnoreCase)
    {
      ["html"] = CreateMap(HtmlMapperCatalog.Create()),
      ["react"] = CreateMap(ReactMapperCatalog.Create()),
      ["angular"] = CreateMap(AngularMapperCatalog.Create())
    };


  public (string Html, string Css) GenerateFromCanvas(string canvasJson, string framework)
  {
    var root = ParseCanvas(canvasJson);
    return Generate(root, framework);
  }

  public (string Html, string Css) Generate(IRNode root, string framework)
  {
    var artifacts = GeneratePageArtifacts(root, framework);
    return (artifacts.Html, artifacts.Css);
  }

  private GeneratedPageArtifacts GeneratePageArtifacts(IRNode root, string framework)
  {
    if (!Validate(root))
      throw new InvalidOperationException("IR validation failed.");

    var exportRoot = NormalizeExportRoot(root);
    var cssClassMap = CssClassNameResolver.Build(exportRoot);

    var frameworkMappers = ResolveFrameworkMappers(framework);

    var styles = new StyleBuilder();
    var context = new EmitContext
    {
      Framework = framework,
      Depth = 0,
      Styles = styles,
      CssClassMap = cssClassMap,
      EmitChild = (node, childContext) => EmitNode(node, childContext, framework, frameworkMappers)
    };

    var html = EmitNode(exportRoot, context, framework, frameworkMappers);
    var css = styles.Build();

    return new GeneratedPageArtifacts(html, css, exportRoot, cssClassMap, styles);
  }

  public bool Validate(IRNode root) => IrValidator.Validate(root);

  public List<GeneratedFile> GenerateMultiPage(
    IEnumerable<(string PageName, int ViewportWidth, IRNode Ir)> pages,
    string framework)
  {
    var pageList = pages.ToList();
    if (pageList.Count == 0)
      throw new ArgumentException("At least one page is required.");

    var grouped = pageList
      .GroupBy(p => p.PageName, StringComparer.OrdinalIgnoreCase)
      .ToList();

    var files = new List<GeneratedFile>();

    var pageEntries = new List<(string slug, string pascal, string htmlFragment, string css, string debugMap)>();

    foreach (var group in grouped)
    {
      var sorted = group.OrderByDescending(p => p.ViewportWidth).ToList();
      var primary = sorted[0];

      var primaryArtifacts = GeneratePageArtifacts(primary.Ir, framework);
      var htmlFragment = primaryArtifacts.Html;
      var baseCss = primaryArtifacts.Css;

      var cssSb = new StringBuilder(baseCss);

      foreach (var breakpoint in sorted.Skip(1))
      {
        var breakpointArtifacts = GeneratePageArtifacts(breakpoint.Ir, framework);
        var diffCss = BuildBreakpointDiffCss(
          primaryArtifacts.Styles,
          breakpointArtifacts.Styles,
          breakpoint.ViewportWidth,
          $"{breakpoint.PageName} – {breakpoint.ViewportWidth}px");
        if (!string.IsNullOrWhiteSpace(diffCss))
          cssSb.Append(diffCss);
      }

      var slug = ToKebabCase(group.Key);
      var pascal = ToPascalCase(group.Key);
      var debugMap = ExportDebugMapBuilder.Build(group.Key, framework, primaryArtifacts.ExportRoot, primaryArtifacts.CssClassMap);
      pageEntries.Add((slug, pascal, htmlFragment, cssSb.ToString(), debugMap));
    }

    var fw = framework.ToLowerInvariant();

    if (fw == "html")
      EmitHtmlFiles(pageEntries, files);
    else if (fw == "react")
      EmitReactFiles(pageEntries, files);
    else if (fw == "angular")
      EmitAngularFiles(pageEntries, files);
    else
      throw new ArgumentException($"Unsupported framework '{framework}'.");

    return files;
  }

  // ── Multi-page file emitters ─────────────────────────────

  private static void EmitHtmlFiles(
    List<(string slug, string pascal, string htmlFragment, string css, string debugMap)> entries,
    List<GeneratedFile> files)
  {
    files.Add(new GeneratedFile("styles.css", SharedCssReset));

    foreach (var (slug, _, htmlFragment, css, debugMap) in entries)
    {
      var sb = new StringBuilder();
      sb.AppendLine("<!DOCTYPE html>");
      sb.AppendLine("<html lang=\"en\">");
      sb.AppendLine("<head>");
      sb.AppendLine("  <meta charset=\"UTF-8\" />");
      sb.AppendLine("  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\" />");
      sb.Append("  <title>").Append(slug).AppendLine("</title>");
      sb.AppendLine("  <link rel=\"stylesheet\" href=\"styles.css\" />");
      sb.Append("  <link rel=\"stylesheet\" href=\"").Append(slug).AppendLine(".css\" />");
      sb.AppendLine("</head>");
      sb.AppendLine("<body>");
      sb.AppendLine(htmlFragment);
      sb.AppendLine("</body>");
      sb.AppendLine("</html>");

      files.Add(new GeneratedFile($"{slug}.html", sb.ToString()));
      files.Add(new GeneratedFile($"{slug}.css", css));
      files.Add(new GeneratedFile($"debug/{slug}.class-map.json", debugMap));
    }
  }

  private static void EmitReactFiles(
    List<(string slug, string pascal, string htmlFragment, string css, string debugMap)> entries,
    List<GeneratedFile> files)
  {
    files.Add(new GeneratedFile("styles/shared.css", SharedCssReset));

    var routeImports = new StringBuilder();
    var routeElements = new StringBuilder();

    for (var i = 0; i < entries.Count; i++)
    {
      var (slug, pascal, htmlFragment, css, debugMap) = entries[i];
      var componentName = $"{pascal}Page";
      var cssPath = $"../styles/{slug}-page.css";
      var routePath = i == 0 ? "/" : $"/{slug}";

      var sb = new StringBuilder();
      sb.Append("import '").Append(cssPath).AppendLine("';");
      sb.AppendLine();
      sb.Append("export function ").Append(componentName).AppendLine("() {");
      sb.AppendLine("  return (");
      sb.AppendLine("    <>");
      sb.AppendLine(IndentBlock(htmlFragment, 6));
      sb.AppendLine("    </>");
      sb.AppendLine("  );");
      sb.AppendLine("}");

      files.Add(new GeneratedFile($"pages/{componentName}.jsx", sb.ToString()));
      files.Add(new GeneratedFile($"styles/{slug}-page.css", css));
      files.Add(new GeneratedFile($"debug/{slug}.class-map.json", debugMap));

      routeImports.Append("import { ").Append(componentName).Append(" } from './pages/").Append(componentName).AppendLine("';");
      routeElements.Append("        <Route path=\"").Append(routePath).Append("\" element={<").Append(componentName).AppendLine(" />} />");
    }

    var app = new StringBuilder();
    app.AppendLine("import { BrowserRouter, Routes, Route } from 'react-router-dom';");
    app.Append(routeImports);
    app.AppendLine();
    app.AppendLine("export default function App() {");
    app.AppendLine("  return (");
    app.AppendLine("    <BrowserRouter>");
    app.AppendLine("      <Routes>");
    app.Append(routeElements);
    app.AppendLine("      </Routes>");
    app.AppendLine("    </BrowserRouter>");
    app.AppendLine("  );");
    app.AppendLine("}");

    files.Add(new GeneratedFile("App.jsx", app.ToString()));
  }

  private static void EmitAngularFiles(
    List<(string slug, string pascal, string htmlFragment, string css, string debugMap)> entries,
    List<GeneratedFile> files)
  {
    files.Add(new GeneratedFile("styles/shared.css", SharedCssReset));

    var routeImports = new StringBuilder();
    var routeEntries = new StringBuilder();

    for (var i = 0; i < entries.Count; i++)
    {
      var (slug, pascal, htmlFragment, css, debugMap) = entries[i];
      var componentClass = $"{pascal}Component";
      var routePath = i == 0 ? "" : slug;

      var sb = new StringBuilder();
      sb.AppendLine("import { Component } from '@angular/core';");
      sb.AppendLine();
      sb.AppendLine("@Component({");
      sb.Append("  selector: 'app-").Append(slug).AppendLine("',");
      sb.AppendLine("  standalone: true,");
      sb.Append("  templateUrl: './").Append(slug).AppendLine(".component.html',");
      sb.Append("  styleUrl: './").Append(slug).AppendLine(".component.css',");
      sb.AppendLine("})");
      sb.Append("export class ").Append(componentClass).AppendLine(" {}");

      files.Add(new GeneratedFile($"pages/{slug}/{slug}.component.ts", sb.ToString()));
      files.Add(new GeneratedFile($"pages/{slug}/{slug}.component.html", htmlFragment));
      files.Add(new GeneratedFile($"pages/{slug}/{slug}.component.css", css));
      files.Add(new GeneratedFile($"debug/{slug}.class-map.json", debugMap));

      routeImports.Append("import { ").Append(componentClass).Append(" } from './pages/").Append(slug).Append('/').Append(slug).AppendLine(".component';");
      routeEntries.Append("  { path: '").Append(routePath).Append("', component: ").Append(componentClass).AppendLine(" },");
    }

    var routes = new StringBuilder();
    routes.AppendLine("import { Routes } from '@angular/router';");
    routes.Append(routeImports);
    routes.AppendLine();
    routes.AppendLine("export const routes: Routes = [");
    routes.Append(routeEntries);
    routes.AppendLine("];");

    var appComp = new StringBuilder();
    appComp.AppendLine("import { Component } from '@angular/core';");
    appComp.AppendLine("import { RouterOutlet } from '@angular/router';");
    appComp.AppendLine();
    appComp.AppendLine("@Component({");
    appComp.AppendLine("  selector: 'app-root',");
    appComp.AppendLine("  standalone: true,");
    appComp.AppendLine("  imports: [RouterOutlet],");
    appComp.AppendLine("  template: '<router-outlet />',");
    appComp.AppendLine("})");
    appComp.AppendLine("export class AppComponent {}");

    files.Add(new GeneratedFile("app.routes.ts", routes.ToString()));
    files.Add(new GeneratedFile("app.component.ts", appComp.ToString()));
  }

  // ── Naming helpers ───────────────────────────────────────

  private static string ToKebabCase(string name)
  {
    if (string.IsNullOrWhiteSpace(name)) return "page";
    var slug = Regex.Replace(name.Trim().ToLowerInvariant(), @"[^a-z0-9]+", "-").Trim('-');
    return slug.Length > 0 ? slug : "page";
  }

  private static IRNode NormalizeExportRoot(IRNode root)
  {
    if (!IsCanvasRoot(root))
      return root;

    if (root.Children.Count == 1)
      return ClonePageRoot(root.Children[0]);

    return ClonePageRoot(root);
  }

  private static bool IsCanvasRoot(IRNode node)
  {
    if (string.Equals(node.Id, "canvas-root", StringComparison.OrdinalIgnoreCase))
      return true;

    return node.Props.TryGetValue("role", out var role)
      && string.Equals(role?.ToString(), "canvas-root", StringComparison.OrdinalIgnoreCase);
  }

  private static IRNode ClonePageRoot(IRNode node)
  {
    var meta = node.Meta ?? new IRMeta();

    return new IRNode
    {
      Id = node.Id,
      Type = node.Type,
      Props = new Dictionary<string, object?>(node.Props),
      Layout = node.Layout,
      Style = MakePageRootStyle(node.Style),
      Position = new IRPosition { Mode = PositionMode.Relative },
      Variants = node.Variants,
      Children = node.Children,
      Meta = new IRMeta
      {
        Name = "page",
        Hidden = meta.Hidden,
        ComponentInstanceId = meta.ComponentInstanceId
      }
    };
  }

  /// <summary>
  /// Returns a style copy where width is overridden to 100% and height to 100vh so the page
  /// root fills the browser viewport dynamically instead of being a fixed canvas size.
  /// All other style properties (background, overflow, border-radius, etc.) are preserved.
  /// </summary>
  private static IRStyle MakePageRootStyle(IRStyle? source)
  {
    var s = new IRStyle();

    if (source is not null)
    {
      s.Color = source.Color;
      s.Background = source.Background;
      s.Transform = source.Transform;
      s.TransformOrigin = source.TransformOrigin;
      s.BackfaceVisibility = source.BackfaceVisibility;
      s.TransformStyle = source.TransformStyle;
      s.MinWidth = source.MinWidth;
      s.MaxWidth = source.MaxWidth;
      s.MinHeight = source.MinHeight;
      s.MaxHeight = source.MaxHeight;
      s.FontSize = source.FontSize;
      s.FontWeight = source.FontWeight;
      s.FontFamily = source.FontFamily;
      s.FontStyle = source.FontStyle;
      s.LineHeight = source.LineHeight;
      s.LetterSpacing = source.LetterSpacing;
      s.TextAlign = source.TextAlign;
      s.BorderRadius = source.BorderRadius;
      s.BorderTopLeftRadius = source.BorderTopLeftRadius;
      s.BorderTopRightRadius = source.BorderTopRightRadius;
      s.BorderBottomRightRadius = source.BorderBottomRightRadius;
      s.BorderBottomLeftRadius = source.BorderBottomLeftRadius;
      s.Border = source.Border;
      s.Overflow = source.Overflow;
      s.Shadows = source.Shadows;
      s.Opacity = source.Opacity;
      s.Padding = source.Padding;
      s.Margin = source.Margin;
    }

    // Always override dimensions to responsive values
    s.Width = new IRLength { Value = 100, Unit = "%" };
    s.Height = new IRLength { Value = 100, Unit = "vh" };

    return s;
  }

  private static IRNode CloneNodeWithName(IRNode node, string name)
  {
    var meta = node.Meta ?? new IRMeta();

    return new IRNode
    {
      Id = node.Id,
      Type = node.Type,
      Props = new Dictionary<string, object?>(node.Props),
      Layout = node.Layout,
      Style = node.Style,
      Position = node.Position,
      Variants = node.Variants,
      Children = node.Children,
      Meta = new IRMeta
      {
        Name = name,
        Hidden = meta.Hidden,
        ComponentInstanceId = meta.ComponentInstanceId
      }
    };
  }

  private static string ToPascalCase(string name)
  {
    var kebab = ToKebabCase(name);
    return string.Join("", kebab.Split('-', StringSplitOptions.RemoveEmptyEntries)
      .Select(part => char.ToUpperInvariant(part[0]) + part[1..]));
  }

  private static string IndentBlock(string block, int spaces)
  {
    var indent = new string(' ', spaces);
    return string.Join('\n', block.TrimEnd().Split('\n').Select(line =>
      string.IsNullOrWhiteSpace(line) ? "" : indent + line));
  }

  private const string SharedCssReset = """
    *,
    *::before,
    *::after {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      font-family: system-ui, -apple-system, sans-serif;
      line-height: 1.5;
      -webkit-font-smoothing: antialiased;
    }

    img,
    svg {
      display: block;
      max-width: 100%;
    }
    """;

  private static string EmitNode(
    IRNode node,
    EmitContext ctx,
    string framework,
    IReadOnlyDictionary<string, IComponentMapper> frameworkMappers)
  {
    if (!frameworkMappers.TryGetValue(node.Type, out var mapper))
    {
      // Unknown type: fall back to Container mapper to avoid crashing on future node types
      if (!frameworkMappers.TryGetValue("Container", out mapper))
        return $"{ctx.Indent}<!-- unknown type: {node.Type} -->\n";
    }

    return mapper.Emit(node, ctx);
  }

  private static IReadOnlyDictionary<string, IComponentMapper> ResolveFrameworkMappers(string framework)
  {
    if (FrameworkMappers.TryGetValue(framework, out var mappers))
      return mappers;

    throw new ArgumentException(
      $"Unsupported framework '{framework}'. Supported frameworks: {string.Join(", ", FrameworkMappers.Keys)}.");
  }

  private static IReadOnlyDictionary<string, IComponentMapper> CreateMap(IEnumerable<IComponentMapper> mappers)
  {
    var map = new Dictionary<string, IComponentMapper>(StringComparer.OrdinalIgnoreCase);
    foreach (var mapper in mappers)
      map[mapper.Type] = mapper;

    return map;
  }
  public IRNode ParseCanvas(string canvasJson) => CanvasParser.Parse(canvasJson);

  public string GenerateDiffCss(IRNode primary, IRNode breakpoint, string framework, int maxWidth, string label)
  {
    var primaryArtifacts = GeneratePageArtifacts(primary, framework);
    var breakpointArtifacts = GeneratePageArtifacts(breakpoint, framework);
    return BuildBreakpointDiffCss(primaryArtifacts.Styles, breakpointArtifacts.Styles, maxWidth, label);
  }

  // ── Responsive diff helpers ───────────────────────────────

  /// <summary>
  /// Compares the CSS rules of a breakpoint against the primary and returns a
  /// @media block containing only the properties that differ. Returns empty string
  /// when there are no differences.
  /// </summary>
  private static string BuildBreakpointDiffCss(
    StyleBuilder primaryStyles,
    StyleBuilder breakpointStyles,
    int maxWidth,
    string label)
  {
    var primaryRules = primaryStyles.GetBaseRulesSnapshot();
    var bpRules = breakpointStyles.GetBaseRulesSnapshot();

    var diffSelectors = new List<(string CssClass, List<KeyValuePair<string, string>> Props)>();

    foreach (var (cssClass, bpProps) in bpRules)
    {
      primaryRules.TryGetValue(cssClass, out var primProps);

      var diffProps = bpProps
        .Where(kv => primProps is null
          || !primProps.TryGetValue(kv.Key, out var primVal)
          || primVal != kv.Value)
        .ToList();

      if (diffProps.Count > 0)
        diffSelectors.Add((cssClass, diffProps));
    }

    if (diffSelectors.Count == 0)
      return string.Empty;

    var sb = new StringBuilder();
    sb.Append($"\n/* {label} */\n");
    sb.Append($"@media (max-width: {maxWidth}px) {{\n");

    foreach (var (cssClass, diffProps) in diffSelectors)
    {
      sb.Append($"  .{cssClass} {{\n");
      foreach (var (k, v) in diffProps)
        sb.Append($"    {k}: {v};\n");
      sb.Append("  }\n");
    }

    sb.Append("}\n");
    return sb.ToString();
  }

}
