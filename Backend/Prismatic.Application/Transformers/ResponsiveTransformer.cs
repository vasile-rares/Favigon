using System.Text;
using Prismatic.Domain.IR;

namespace Prismatic.Application.Transformers;

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
      Dictionary<string, IRResponsiveOverride> responsive,
      string selector)
  {
    if (responsive.Count == 0) return string.Empty;

    var sb = new StringBuilder();

    foreach (var breakpoint in Breakpoints.Keys)
    {
      if (!responsive.TryGetValue(breakpoint, out var @override)) continue;

      var props = BuildOverrideProperties(@override);
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

  private static Dictionary<string, string> BuildOverrideProperties(IRResponsiveOverride @override)
  {
    var props = new Dictionary<string, string>(StringComparer.Ordinal);

    if (@override.Layout is not null)
      foreach (var kv in LayoutTransformer.ToCssProperties(@override.Layout))
        props[kv.Key] = kv.Value;

    if (@override.Style is not null)
      foreach (var kv in StyleTransformer.ToCssProperties(@override.Style))
        props[kv.Key] = kv.Value;

    return props;
  }
}
