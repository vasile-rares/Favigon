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
      "Text" => !string.IsNullOrWhiteSpace(ReadStringProp(node, "href"))
        ? "a"
        : ResolveTag(node, ReadBoolProp(node, "inline") ? "span" : "p", "div", "p", "span", "label"),
      "Heading" => $"h{Math.Clamp(ReadIntProp(node, "level", 2), 1, 6)}",
      "Link" => "a",
      "Card" => "div",
      "Image" => !string.IsNullOrWhiteSpace(ReadStringProp(node, "href")) ? "a" : "img",
      "Icon" => "span",
      "Badge" => "span",
      "Avatar" => !string.IsNullOrWhiteSpace(ReadStringProp(node, "src")) ? "img" : "span",
      "Table" => "table",
      "List" => ReadBoolProp(node, "ordered") ? "ol" : "ul",
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
      "Container" => !string.IsNullOrWhiteSpace(ReadStringProp(node, "href"))
        ? "a"
        : ResolveTag(node, "div", "div", "section", "article", "aside", "main", "header", "footer", "nav"),
      "Frame" => !string.IsNullOrWhiteSpace(ReadStringProp(node, "href"))
        ? "a"
        : ResolveTag(node, "div", "div", "section", "article", "aside", "main", "header", "footer", "nav"),
      "Divider" => string.Equals(ReadStringProp(node, "orientation", "horizontal"), "vertical", StringComparison.OrdinalIgnoreCase)
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

  private static string ResolveTag(IRNode node, string defaultTag, params string[] allowedTags)
  {
    var requestedTag = ReadStringProp(node, "tag");
    if (string.IsNullOrWhiteSpace(requestedTag))
      return defaultTag;

    foreach (var allowedTag in allowedTags)
    {
      if (string.Equals(allowedTag, requestedTag, StringComparison.OrdinalIgnoreCase))
        return allowedTag;
    }

    return defaultTag;
  }

  private static string ReadStringProp(IRNode node, string key, string defaultValue = "")
  {
    if (!node.Props.TryGetValue(key, out var value))
      return defaultValue;

    return value switch
    {
      null => defaultValue,
      JsonElement jsonElement => jsonElement.ValueKind == JsonValueKind.String
        ? jsonElement.GetString() ?? defaultValue
        : jsonElement.ToString(),
      _ => value.ToString() ?? defaultValue
    };
  }

  private static bool ReadBoolProp(IRNode node, string key, bool defaultValue = false)
  {
    if (!node.Props.TryGetValue(key, out var value))
      return defaultValue;

    return value switch
    {
      null => defaultValue,
      JsonElement jsonElement => jsonElement.ValueKind == JsonValueKind.True,
      bool boolValue => boolValue,
      _ => bool.TryParse(value.ToString(), out var parsed) ? parsed : defaultValue
    };
  }

  private static int ReadIntProp(IRNode node, string key, int defaultValue = 0)
  {
    if (!node.Props.TryGetValue(key, out var value))
      return defaultValue;

    return value switch
    {
      null => defaultValue,
      JsonElement jsonElement => jsonElement.TryGetInt32(out var intValue) ? intValue : defaultValue,
      int intValue => intValue,
      _ => int.TryParse(value.ToString(), out var parsed) ? parsed : defaultValue
    };
  }
}