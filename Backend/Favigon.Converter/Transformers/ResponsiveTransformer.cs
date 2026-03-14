using System.Text;
using Favigon.Converter.Models;

namespace Favigon.Converter.Transformers;

public static class ResponsiveTransformer
{
  private static readonly Dictionary<string, string> Breakpoints = new(StringComparer.OrdinalIgnoreCase)
  {
    ["xs"] = "0px",
    ["sm"] = "640px",
    ["md"] = "768px",
    ["lg"] = "1024px",
    ["xl"] = "1280px",
    ["2xl"] = "1536px"
  };

  public static string ToCssMediaQueries(
      Dictionary<string, IRVariant> variants,
      string selector)
  {
    if (variants.Count == 0) return string.Empty;

    var sb = new StringBuilder();

    foreach (var breakpoint in Breakpoints.Keys)
    {
      if (!variants.TryGetValue(breakpoint, out var variant)) continue;

      var props = BuildVariantProperties(variant);
      if (props.Count == 0) continue;

      sb.Append($"@media (min-width: {Breakpoints[breakpoint]}) {{\n");
      sb.Append($"  {selector} {{\n");
      foreach (var (k, v) in props)
        sb.Append($"    {k}: {v};\n");
      sb.Append("  }\n");
      sb.Append("}\n");
    }

    return sb.ToString();
  }

  private static Dictionary<string, string> BuildVariantProperties(IRVariant variant)
  {
    var props = new Dictionary<string, string>(StringComparer.Ordinal);

    if (variant.Layout is not null)
      foreach (var kv in LayoutTransformer.ToCssProperties(variant.Layout))
        props[kv.Key] = kv.Value;

    if (variant.Style is not null)
      foreach (var kv in StyleTransformer.ToCssProperties(variant.Style))
        props[kv.Key] = kv.Value;

    return props;
  }
}
