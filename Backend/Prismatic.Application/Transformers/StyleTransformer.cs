using Prismatic.Domain.IR;

namespace Prismatic.Application.Transformers;

/// <summary>
/// Converts an <see cref="IRStyle"/> into CSS property declarations.
/// </summary>
public static class StyleTransformer
{
  private static readonly Dictionary<string, string> ShadowMap = new(StringComparer.OrdinalIgnoreCase)
  {
    ["none"] = "none",
    ["sm"] = "0 1px 2px 0 rgba(0,0,0,0.05)",
    ["md"] = "0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -2px rgba(0,0,0,0.1)",
    ["lg"] = "0 10px 15px -3px rgba(0,0,0,0.1), 0 4px 6px -4px rgba(0,0,0,0.1)",
    ["xl"] = "0 20px 25px -5px rgba(0,0,0,0.1), 0 8px 10px -6px rgba(0,0,0,0.1)"
  };

  public static Dictionary<string, string> ToCssProperties(IRStyle style)
  {
    var css = new Dictionary<string, string>(StringComparer.Ordinal);

    if (style.Color is not null) css["color"] = style.Color;
    if (style.Background is not null) css["background"] = style.Background;
    if (style.Border is not null) css["border"] = style.Border;

    if (style.BorderRadius is not null) css["border-radius"] = $"{style.BorderRadius}px";
    if (style.FontSize is not null) css["font-size"] = $"{style.FontSize}px";
    if (style.FontWeight is not null) css["font-weight"] = style.FontWeight.Value.ToString();
    if (style.FontFamily is not null) css["font-family"] = style.FontFamily;

    if (style.Shadow is not null && ShadowMap.TryGetValue(style.Shadow, out var shadow))
      css["box-shadow"] = shadow;

    if (style.Opacity is not null) css["opacity"] = style.Opacity.Value.ToString("G");

    if (style.Width is not null) css["width"] = style.Width;
    if (style.Height is not null) css["height"] = style.Height;
    if (style.MinWidth is not null) css["min-width"] = style.MinWidth;
    if (style.MaxWidth is not null) css["max-width"] = style.MaxWidth;
    if (style.MinHeight is not null) css["min-height"] = style.MinHeight;
    if (style.MaxHeight is not null) css["max-height"] = style.MaxHeight;

    return css;
  }

  public static string ToInlineStyle(IRStyle style) => CssUtils.BuildInlineStyle(ToCssProperties(style));
  public static string ToCssBlock(IRStyle style) => CssUtils.BuildCssBlock(ToCssProperties(style));

  /// <summary>Merges layout and style into a single inline-style string.</summary>
  public static string MergeToInlineStyle(IRLayout? layout, IRStyle? style) =>
      CssUtils.BuildInlineStyle(MergeToProperties(layout, style));

  /// <summary>
  /// Merges layout and style into a single CSS property dictionary.
  /// Used by generators that deposit styles into a <see cref="StyleCollector"/>.
  /// </summary>
  public static Dictionary<string, string> MergeToProperties(IRLayout? layout, IRStyle? style)
  {
    var merged = new Dictionary<string, string>(StringComparer.Ordinal);

    if (layout is not null)
      foreach (var kv in LayoutTransformer.ToCssProperties(layout))
        merged[kv.Key] = kv.Value;

    if (style is not null)
      foreach (var kv in ToCssProperties(style))
        merged[kv.Key] = kv.Value;

    return merged;
  }
}
