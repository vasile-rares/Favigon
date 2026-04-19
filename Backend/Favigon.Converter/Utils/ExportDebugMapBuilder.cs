using System.Text.Json;
using Favigon.Converter.Models;

namespace Favigon.Converter.Utils;

public static class ExportDebugMapBuilder
{
  private static readonly JsonSerializerOptions JsonOptions = new()
  {
    WriteIndented = true
  };

  public static string Build(
    string pageName,
    string framework,
    IRNode exportRoot,
    IReadOnlyDictionary<string, NodeCssClasses> cssClassMap)
  {
    var payload = new
    {
      pageName,
      framework = framework.ToLowerInvariant(),
      rootNodeId = exportRoot.Id,
      nodes = Flatten(exportRoot)
        .Select(node => BuildNodeEntry(node, cssClassMap))
        .ToList()
    };

    return JsonSerializer.Serialize(payload, JsonOptions);
  }

  private static object BuildNodeEntry(
    IRNode node,
    IReadOnlyDictionary<string, NodeCssClasses> cssClassMap)
  {
    var cssClasses = cssClassMap.TryGetValue(node.Id, out var resolvedClasses)
      ? resolvedClasses
      : new NodeCssClasses(CssClassNameResolver.GetSemanticSeed(node), CssClassNameResolver.GetSemanticSeed(node));

    return new
    {
      id = node.Id,
      type = node.Type,
      name = node.Meta.Name,
      htmlTag = ResolveHtmlTag(node),
      markupClass = cssClasses.MarkupClasses,
      cssSelector = $".{cssClasses.TargetClass}"
    };
  }

  private static IEnumerable<IRNode> Flatten(IRNode root)
  {
    yield return root;

    foreach (var child in root.Children)
    {
      foreach (var descendant in Flatten(child))
        yield return descendant;
    }
  }

  private static string ResolveHtmlTag(IRNode node)
  {
    return node.Type switch
    {
      "Text" => !string.IsNullOrWhiteSpace(IrProps.GetString(node, "href"))
        ? "a"
        : IrProps.ResolveTag(node, IrProps.GetBool(node, "inline") ? "span" : "p", "div", "p", "span", "label"),
      "Heading" => $"h{Math.Clamp(IrProps.GetInt(node, "level", 2), 1, 6)}",
      "Link" => "a",
      "Card" => "div",
      "Image" => !string.IsNullOrWhiteSpace(IrProps.GetString(node, "href")) ? "a" : "img",
      "Icon" => "span",
      "Badge" => "span",
      "Avatar" => !string.IsNullOrWhiteSpace(IrProps.GetString(node, "src")) ? "img" : "span",
      "Table" => "table",
      "List" => IrProps.GetBool(node, "ordered") ? "ol" : "ul",
      "Button" => "button",
      "Input" => "input",
      "Textarea" => "textarea",
      "Select" => "select",
      "Checkbox" => "label",
      "Radio" => "label",
      "Toggle" => "label",
      "Form" => "form",
      "Stack" => "div",
      "Row" => "div",
      "Column" => "div",
      "Grid" => "div",
      "Container" => !string.IsNullOrWhiteSpace(IrProps.GetString(node, "href"))
        ? "a"
        : IrProps.ResolveTag(node, "div", "div", "section", "article", "aside", "main", "header", "footer", "nav"),
      "Frame" => !string.IsNullOrWhiteSpace(IrProps.GetString(node, "href"))
        ? "a"
        : IrProps.ResolveTag(node, "div", "div", "section", "article", "aside", "main", "header", "footer", "nav"),
      "Divider" => string.Equals(IrProps.GetString(node, "orientation", "horizontal"), "vertical", StringComparison.OrdinalIgnoreCase)
        ? "div"
        : "hr",
      "Navbar" => "nav",
      "Sidebar" => "aside",
      "Modal" => "dialog",
      "Drawer" => "div",
      "Tooltip" => "div",
      "Tabs" => "div",
      "Accordion" => "details",
      "Breadcrumb" => "nav",
      "Pagination" => "nav",
      _ => "div"
    };
  }
}