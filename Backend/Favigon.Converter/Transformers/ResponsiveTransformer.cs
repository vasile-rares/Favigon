using Favigon.Converter.Models;

namespace Favigon.Converter.Transformers;

public static class ResponsiveTransformer
{
  internal static Dictionary<string, string> BuildVariantProperties(IRVariant variant)
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
