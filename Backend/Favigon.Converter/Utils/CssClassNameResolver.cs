using System.Text.RegularExpressions;
using Favigon.Converter.Models;

namespace Favigon.Converter.Utils;

public sealed record NodeCssClasses(string SemanticClass, string TargetClass)
{
  public string MarkupClasses => SemanticClass == TargetClass
    ? SemanticClass
    : $"{SemanticClass} {TargetClass}";
}

public static class CssClassNameResolver
{
  private static readonly IReadOnlyDictionary<string, string> DuplicateAliases =
    new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
    {
      ["rectangle"] = "rect"
    };

  public static IReadOnlyDictionary<string, NodeCssClasses> Build(IRNode root)
  {
    var nodes = Flatten(root).ToList();
    var counts = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);

    foreach (var node in nodes)
    {
      var semanticSeed = GetBaseClassName(node);
      counts[semanticSeed] = counts.GetValueOrDefault(semanticSeed) + 1;
    }

    var ordinals = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
    var map = new Dictionary<string, NodeCssClasses>(StringComparer.Ordinal);

    foreach (var node in nodes)
    {
      var semanticSeed = GetBaseClassName(node);
      if (counts[semanticSeed] <= 1)
      {
        map[node.Id] = new NodeCssClasses(semanticSeed, semanticSeed);
        continue;
      }

      var shortBase = GetShortDuplicateBase(semanticSeed);
      var nextIndex = ordinals.GetValueOrDefault(semanticSeed) + 1;
      ordinals[semanticSeed] = nextIndex;
      map[node.Id] = new NodeCssClasses(shortBase, $"{shortBase}-{nextIndex}");
    }

    return map;
  }

  public static string GetBaseClassName(IRNode node)
  {
    if (!string.IsNullOrWhiteSpace(node.Meta.Name))
      return SlugifyValue(node.Meta.Name);

    return SlugifyValue(node.Type);
  }

  private static string GetShortDuplicateBase(string semanticSeed)
  {
    if (DuplicateAliases.TryGetValue(semanticSeed, out var alias))
      return alias;

    return semanticSeed;
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

  private static string SlugifyValue(string? value)
  {
    if (string.IsNullOrWhiteSpace(value))
      return "node";

    var slug = Regex.Replace(value.Trim().ToLowerInvariant(), @"[^a-z0-9]+", "-").Trim('-');
    return slug.Length > 0 ? slug : "node";
  }
}