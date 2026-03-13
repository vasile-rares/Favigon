using Prismatic.Converter.Models;

namespace Prismatic.Converter.Transformers;

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
    if (style.Border is not null) ApplyBorder(css, style.Border);

    if (style.BorderRadius is not null) css["border-radius"] = style.BorderRadius.ToString();
    if (style.FontSize is not null) css["font-size"] = style.FontSize.ToString();
    if (style.FontWeight is not null) css["font-weight"] = style.FontWeight.Value.ToString();
    if (style.FontFamily is not null) css["font-family"] = style.FontFamily;
    if (style.TextAlign is not null) css["text-align"] = style.TextAlign;
    if (style.LineHeight is not null) css["line-height"] = style.LineHeight.ToString();
    if (style.LetterSpacing is not null) css["letter-spacing"] = style.LetterSpacing.ToString();

    if (style.Shadow is not null && ShadowMap.TryGetValue(style.Shadow, out var shadow))
      css["box-shadow"] = shadow;

    if (style.Opacity is not null) css["opacity"] = style.Opacity.Value.ToString("G");

    if (style.Width is not null) css["width"] = style.Width.ToString();
    if (style.Height is not null) css["height"] = style.Height.ToString();
    if (style.MinWidth is not null) css["min-width"] = style.MinWidth.ToString();
    if (style.MaxWidth is not null) css["max-width"] = style.MaxWidth.ToString();
    if (style.MinHeight is not null) css["min-height"] = style.MinHeight.ToString();
    if (style.MaxHeight is not null) css["max-height"] = style.MaxHeight.ToString();

    if (style.Padding is not null) ApplySpacing(css, "padding", style.Padding);
    if (style.Margin is not null) ApplySpacing(css, "margin", style.Margin);

    return css;
  }

  public static Dictionary<string, string> MergeToProperties(
    IRLayout? layout,
    IRStyle? style,
    IRPosition? position = null)
  {
    var merged = new Dictionary<string, string>(StringComparer.Ordinal);

    if (layout is not null)
      foreach (var kv in LayoutTransformer.ToCssProperties(layout))
        merged[kv.Key] = kv.Value;

    if (style is not null)
      foreach (var kv in ToCssProperties(style))
        merged[kv.Key] = kv.Value;

    if (position is not null)
    {
      if (position.Mode == PositionMode.Absolute)
        merged["position"] = "absolute";

      if (position.X is not null) merged["left"] = position.X.ToString();
      if (position.Y is not null) merged["top"] = position.Y.ToString();
      if (position.Top is not null) merged["top"] = position.Top.ToString();
      if (position.Right is not null) merged["right"] = position.Right.ToString();
      if (position.Bottom is not null) merged["bottom"] = position.Bottom.ToString();
      if (position.Left is not null) merged["left"] = position.Left.ToString();
    }

    return merged;
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private static void ApplySpacing(Dictionary<string, string> css, string prop, IRSpacing s)
  {
    var t = s.Top?.ToString();
    var r = s.Right?.ToString();
    var b = s.Bottom?.ToString();
    var l = s.Left?.ToString();

    if (t == r && r == b && b == l && t is not null)
    { css[prop] = t; return; }

    if (t is not null) css[$"{prop}-top"] = t;
    if (r is not null) css[$"{prop}-right"] = r;
    if (b is not null) css[$"{prop}-bottom"] = b;
    if (l is not null) css[$"{prop}-left"] = l;
  }

  private static void ApplyBorder(Dictionary<string, string> css, IRBorder border)
  {
    if (border.Style == Models.BorderStyle.None)
    {
      css["border"] = "none";
      return;
    }

    var parts = new List<string>();
    if (border.Width is not null) parts.Add(border.Width.ToString());
    parts.Add(MapBorderStyle(border.Style));
    if (border.Color is not null) parts.Add(border.Color);
    var declaration = string.Join(" ", parts);

    bool hasSpecificSides = border.Top is true || border.Right is true
                         || border.Bottom is true || border.Left is true;
    if (!hasSpecificSides)
    {
      css["border"] = declaration;
      return;
    }

    // Emit all four sides explicitly so unselected sides are cleared
    css["border-top"]    = border.Top    is true ? declaration : "none";
    css["border-right"]  = border.Right  is true ? declaration : "none";
    css["border-bottom"] = border.Bottom is true ? declaration : "none";
    css["border-left"]   = border.Left   is true ? declaration : "none";
  }

  private static string MapBorderStyle(Models.BorderStyle style) => style switch
  {
    Models.BorderStyle.Dashed => "dashed",
    Models.BorderStyle.Dotted => "dotted",
    Models.BorderStyle.Double => "double",
    _ => "solid"
  };
}
