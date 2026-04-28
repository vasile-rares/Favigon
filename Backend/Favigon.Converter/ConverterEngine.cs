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
    return GenerateSinglePage(root, framework);
  }

  public (string Html, string Css) GenerateSinglePage(IRNode root, string framework)
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
      string htmlFragment;
      string pageCss;

      if (sorted.Count == 1)
      {
        htmlFragment = primaryArtifacts.Html;
        pageCss = primaryArtifacts.Css;
      }
      else
      {
        var breakpoints = sorted.Skip(1).Select(bp => (
          GeneratePageArtifacts(bp.Ir, framework),
          bp.ViewportWidth,
          $"{bp.PageName} – {bp.ViewportWidth}px"));
        (htmlFragment, pageCss) = BuildResponsiveArtifacts(primaryArtifacts, breakpoints, framework);
      }

      var slug = ToKebabCase(group.Key);
      var pascal = ToPascalCase(group.Key);
      var debugMap = ExportDebugMapBuilder.Build(group.Key, framework, primaryArtifacts.ExportRoot, primaryArtifacts.CssClassMap);
      pageEntries.Add((slug, pascal, htmlFragment, pageCss, debugMap));
    }

    var fw = framework.ToLowerInvariant();

    if (fw == FrameworkNames.Html)
      EmitHtmlFiles(pageEntries, files);
    else if (fw == FrameworkNames.React)
      EmitReactFiles(pageEntries, files);
    else if (fw == FrameworkNames.Angular)
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

    // Always override dimensions to responsive values.
    // Use min-height (not height) so content taller than the viewport can scroll
    // inside the iframe instead of overflowing the outer preview stage.
    s.Width = new IRLength { Value = 100, Unit = "%" };
    s.MinHeight = new IRLength { Value = 100, Unit = "vh" };

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
    var orderDiffs = BuildNodeOrderDiffs(primaryArtifacts.ExportRoot, breakpointArtifacts.ExportRoot, primaryArtifacts.CssClassMap);
    return BuildBreakpointDiffCss(primaryArtifacts.Styles, breakpointArtifacts.Styles, orderDiffs, maxWidth, label);
  }

  public (string Html, string Css) GenerateResponsiveOutput(
    IReadOnlyList<(IRNode Ir, int ViewportWidth, string Label)> sortedDescending,
    string framework)
  {
    if (sortedDescending.Count == 0)
      throw new ArgumentException("At least one page is required.");

    var primaryArtifacts = GeneratePageArtifacts(sortedDescending[0].Ir, framework);

    if (sortedDescending.Count == 1)
      return (primaryArtifacts.Html, primaryArtifacts.Css);

    var breakpoints = sortedDescending.Skip(1).Select(p => (
      GeneratePageArtifacts(p.Ir, framework),
      p.ViewportWidth,
      p.Label));

    return BuildResponsiveArtifacts(primaryArtifacts, breakpoints, framework);
  }

  // ── Responsive diff helpers ───────────────────────────────

  /// <summary>
  /// Generates HTML + CSS for a primary page with responsive overrides from the given
  /// breakpoints. Exclusive breakpoint nodes (not in primary) are appended to the HTML
  /// hidden by default and revealed in their respective @media block. Primary-only nodes
  /// (not in a given breakpoint) receive <c>display: none</c> in that breakpoint's @media
  /// block.
  /// </summary>
  private (string Html, string Css) BuildResponsiveArtifacts(
    GeneratedPageArtifacts primaryArtifacts,
    IEnumerable<(GeneratedPageArtifacts Artifacts, int ViewportWidth, string Label)> breakpoints,
    string framework)
  {
    var primaryIds = CollectNodeIds(primaryArtifacts.ExportRoot);

    var htmlSb = new StringBuilder(primaryArtifacts.Html);
    var baseCssSb = new StringBuilder(primaryArtifacts.Css);
    var diffCssSb = new StringBuilder();
    var alreadyProcessedIds = new HashSet<string>(StringComparer.Ordinal);

    foreach (var (bpArtifacts, viewportWidth, label) in breakpoints)
    {
      // Append exclusive breakpoint nodes to the HTML (hidden by default).
      var exclusiveRoots = CollectExclusiveRoots(bpArtifacts.ExportRoot, primaryIds, alreadyProcessedIds);
      foreach (var exclusiveRoot in exclusiveRoots)
      {
        var exclusiveStyles = new StyleBuilder();
        var exclusiveHtml = EmitSubtree(exclusiveRoot, bpArtifacts.CssClassMap, framework, exclusiveStyles);
        htmlSb.Append(exclusiveHtml);

        // Hide the entire exclusive subtree in the base CSS.
        foreach (var (cssClass, _) in exclusiveStyles.GetBaseRulesSnapshot())
          baseCssSb.Append($"\n.{cssClass} {{ display: none; }}\n");

        alreadyProcessedIds.UnionWith(CollectNodeIds(exclusiveRoot));
      }

      var orderDiffs = BuildNodeOrderDiffs(primaryArtifacts.ExportRoot, bpArtifacts.ExportRoot, primaryArtifacts.CssClassMap);
      var diffCss = BuildBreakpointDiffCss(primaryArtifacts.Styles, bpArtifacts.Styles, orderDiffs, viewportWidth, label);
      if (!string.IsNullOrWhiteSpace(diffCss))
        diffCssSb.Append(diffCss);
    }

    baseCssSb.Append(diffCssSb);
    return (htmlSb.ToString(), baseCssSb.ToString());
  }

  /// <summary>
  /// Compares primary and breakpoint styles and returns a CSS string with:
  /// <list type="bullet">
  /// <item>Any new <c>@keyframes</c> (in breakpoint but not in primary), placed before the @media block.</item>
  /// <item>A <c>@media (max-width: Npx)</c> block containing:
  ///   <list type="bullet">
  ///   <item>Changed base-class properties (or <c>display: block</c> for exclusive BP nodes).</item>
  ///   <item><c>display: none</c> for primary-only classes absent from the breakpoint.</item>
  ///   <item><c>order: N</c> for reordered flex/grid children.</item>
  ///   <item>Changed pseudo-class (hover/focus/etc.) rules.</item>
  ///   </list>
  /// </item>
  /// </list>
  /// Returns empty string when there are no differences.
  /// </summary>
  private static string BuildBreakpointDiffCss(
    StyleBuilder primaryStyles,
    StyleBuilder bpStyles,
    IReadOnlyList<(string CssClass, int Order)> orderDiffs,
    int maxWidth,
    string label)
  {
    var primaryBaseRules = primaryStyles.GetBaseRulesSnapshot();
    var bpBaseRules = bpStyles.GetBaseRulesSnapshot();

    // ── Base class diffs ──────────────────────────────────────
    var diffByClass = new Dictionary<string, List<KeyValuePair<string, string>>>(StringComparer.Ordinal);

    foreach (var (cssClass, bpProps) in bpBaseRules)
    {
      primaryBaseRules.TryGetValue(cssClass, out var primProps);

      var diffProps = bpProps
        .Where(kv => primProps is null
          || !primProps.TryGetValue(kv.Key, out var primVal)
          || primVal != kv.Value)
        .ToList();

      // Exclusive-BP class: ensure display is present so the node is un-hidden.
      if (primProps is null && !diffProps.Exists(kv => kv.Key == "display"))
        diffProps.Insert(0, new KeyValuePair<string, string>("display", "block"));

      if (diffProps.Count > 0)
        diffByClass[cssClass] = diffProps;
    }

    // Primary-only classes: hide them at this breakpoint.
    foreach (var cssClass in primaryBaseRules.Keys)
    {
      if (!bpBaseRules.ContainsKey(cssClass))
        diffByClass[cssClass] = [new KeyValuePair<string, string>("display", "none")];
    }

    // ── Order diffs ───────────────────────────────────────────
    foreach (var (cssClass, order) in orderDiffs)
    {
      if (!diffByClass.TryGetValue(cssClass, out var existing))
        diffByClass[cssClass] = existing = [];
      existing.Add(new KeyValuePair<string, string>("order", order.ToString()));
    }

    // ── Pseudo-class diffs ────────────────────────────────────
    var primaryPseudoBySelector = primaryStyles.GetPseudoRulesSnapshot()
      .ToDictionary(r => r.Selector, r => r.Props, StringComparer.Ordinal);

    var pseudoDiffs = new List<(string Selector, List<KeyValuePair<string, string>> Props)>();
    foreach (var (selector, bpProps) in bpStyles.GetPseudoRulesSnapshot())
    {
      primaryPseudoBySelector.TryGetValue(selector, out var primProps);
      var diffProps = bpProps
        .Where(kv => primProps is null
          || !primProps.TryGetValue(kv.Key, out var primVal)
          || primVal != kv.Value)
        .ToList();
      if (diffProps.Count > 0)
        pseudoDiffs.Add((selector, diffProps));
    }

    // ── New keyframes (in breakpoint but not primary) ─────────
    var primaryKfNames = new HashSet<string>(
      primaryStyles.GetKeyframesSnapshot().Select(k => k.Name), StringComparer.Ordinal);
    var newKeyframes = bpStyles.GetKeyframesSnapshot()
      .Where(k => !primaryKfNames.Contains(k.Name))
      .ToList();

    if (diffByClass.Count == 0 && pseudoDiffs.Count == 0 && newKeyframes.Count == 0)
      return string.Empty;

    var sb = new StringBuilder();
    sb.Append($"\n/* {label} */\n");

    // New keyframes go BEFORE the @media block (they can't be inside it in all browsers).
    foreach (var (name, body) in newKeyframes)
      sb.Append($"@keyframes {name} {{\n{body}}}\n");

    var mediaBody = new StringBuilder();

    foreach (var (cssClass, props) in diffByClass)
    {
      mediaBody.Append($"  .{cssClass} {{\n");
      foreach (var (k, v) in props)
        mediaBody.Append($"    {k}: {v};\n");
      mediaBody.Append("  }\n");
    }

    foreach (var (selector, props) in pseudoDiffs)
    {
      mediaBody.Append($"  {selector} {{\n");
      foreach (var (k, v) in props)
        mediaBody.Append($"    {k}: {v};\n");
      mediaBody.Append("  }\n");
    }

    if (mediaBody.Length > 0)
    {
      sb.Append($"@media (max-width: {maxWidth}px) {{\n");
      sb.Append(mediaBody);
      sb.Append("}\n");
    }

    return sb.ToString();
  }

  // ── Responsive node helpers ───────────────────────────────

  private static HashSet<string> CollectNodeIds(IRNode root)
  {
    var ids = new HashSet<string>(StringComparer.Ordinal);
    var queue = new Queue<IRNode>();
    queue.Enqueue(root);
    while (queue.Count > 0)
    {
      var node = queue.Dequeue();
      ids.Add(node.Id);
      foreach (var child in node.Children)
        queue.Enqueue(child);
    }
    return ids;
  }

  /// <summary>
  /// Returns top-level nodes in <paramref name="bpRoot"/>'s tree whose IDs are not in
  /// <paramref name="primaryIds"/> and have not yet been processed (<paramref name="alreadyProcessed"/>).
  /// Does not recurse into found nodes — their entire subtree is emitted together.
  /// </summary>
  private static List<IRNode> CollectExclusiveRoots(
    IRNode bpRoot,
    HashSet<string> primaryIds,
    HashSet<string> alreadyProcessed)
  {
    var result = new List<IRNode>();

    void Walk(IRNode node)
    {
      foreach (var child in node.Children)
      {
        if (!primaryIds.Contains(child.Id) && !alreadyProcessed.Contains(child.Id))
          result.Add(child);
        else
          Walk(child);
      }
    }

    Walk(bpRoot);
    return result;
  }

  /// <summary>
  /// Emits HTML for <paramref name="node"/> and its subtree using the provided CSS class map,
  /// accumulating generated styles into <paramref name="styles"/>.
  /// </summary>
  private string EmitSubtree(
    IRNode node,
    IReadOnlyDictionary<string, NodeCssClasses> cssClassMap,
    string framework,
    StyleBuilder styles)
  {
    var frameworkMappers = ResolveFrameworkMappers(framework);
    var context = new EmitContext
    {
      Framework = framework,
      Depth = 0,
      Styles = styles,
      CssClassMap = cssClassMap,
      EmitChild = (n, ctx) => EmitNode(n, ctx, framework, frameworkMappers)
    };
    return EmitNode(node, context, framework, frameworkMappers);
  }

  // ── Responsive order helpers ──────────────────────────────

  /// <summary>
  /// Detects flex/grid children whose order differs between primary and breakpoint trees.
  /// For each such parent, emits an explicit <c>order: N</c> value for every child.
  /// Uses the primary CSS class map so class names resolve to the HTML already emitted.
  /// </summary>
  private static List<(string CssClass, int Order)> BuildNodeOrderDiffs(
    IRNode primaryRoot,
    IRNode bpRoot,
    IReadOnlyDictionary<string, NodeCssClasses> primaryCssClassMap)
  {
    var primaryParentChildren = BuildFlexGridParentChildrenMap(primaryRoot);
    var bpParentChildren = BuildFlexGridParentChildrenMap(bpRoot);

    var result = new List<(string CssClass, int Order)>();

    foreach (var (parentId, bpChildren) in bpParentChildren)
    {
      if (!primaryParentChildren.TryGetValue(parentId, out var primChildren))
        continue;

      // Compare order of only the shared children (ignoring exclusive nodes on either side).
      var primShared = primChildren.Where(id => bpChildren.Contains(id)).ToList();
      var bpShared = bpChildren.Where(id => primChildren.Contains(id)).ToList();

      if (primShared.SequenceEqual(bpShared))
        continue;

      // Order differs — emit explicit `order` for every BP child so the reorder is applied.
      for (var i = 0; i < bpChildren.Count; i++)
      {
        if (primaryCssClassMap.TryGetValue(bpChildren[i], out var cssClasses))
          result.Add((cssClasses.TargetClass, i));
      }
    }

    return result;
  }

  private static Dictionary<string, List<string>> BuildFlexGridParentChildrenMap(IRNode root)
  {
    var map = new Dictionary<string, List<string>>(StringComparer.Ordinal);

    void Walk(IRNode node)
    {
      if (node.Layout is { Mode: LayoutMode.Flex or LayoutMode.Grid } && node.Children.Count > 1)
        map[node.Id] = node.Children.Select(c => c.Id).ToList();

      foreach (var child in node.Children)
        Walk(child);
    }

    Walk(root);
    return map;
  }

}
