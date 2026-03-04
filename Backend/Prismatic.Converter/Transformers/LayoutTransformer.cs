using Prismatic.Converter.Models;

namespace Prismatic.Converter.Transformers;

public static class LayoutTransformer
{
  public static Dictionary<string, string> ToCssProperties(IRLayout layout)
  {
    var css = new Dictionary<string, string>(StringComparer.Ordinal);

    css["display"] = layout.Mode switch
    {
      "grid" => "grid",
      "stack" => "flex",
      _ => "flex"
    };

    if (layout.Mode == "stack")
      css["flex-direction"] = "column";
    else if (layout.Mode == "flex" && layout.Direction is not null)
      css["flex-direction"] = layout.Direction == "column" ? "column" : "row";

    if (layout.Alignment is not null) css["align-items"] = MapAlignment(layout.Alignment);
    if (layout.Justify is not null) css["justify-content"] = MapAlignment(layout.Justify);
    if (layout.Gap is not null) css["gap"] = $"{layout.Gap}px";
    if (layout.Wrap is not null) css["flex-wrap"] = layout.Wrap;

    if (layout.Mode == "grid" && layout.Columns is not null)
      css["grid-template-columns"] = $"repeat({layout.Columns}, minmax(0, 1fr))";
    if (layout.Mode == "grid" && layout.Rows is not null)
      css["grid-template-rows"] = $"repeat({layout.Rows}, minmax(0, 1fr))";

    if (layout.Padding is not null) ApplySpacing(css, "padding", layout.Padding);
    if (layout.Margin is not null) ApplySpacing(css, "margin", layout.Margin);

    return css;
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private static void ApplySpacing(Dictionary<string, string> css, string prop, IRSpacing s)
  {
    if (s.Top == s.Right && s.Right == s.Bottom && s.Bottom == s.Left && s.Top is not null)
    { css[prop] = $"{s.Top}px"; return; }

    if (s.Top is not null) css[$"{prop}-top"] = $"{s.Top}px";
    if (s.Right is not null) css[$"{prop}-right"] = $"{s.Right}px";
    if (s.Bottom is not null) css[$"{prop}-bottom"] = $"{s.Bottom}px";
    if (s.Left is not null) css[$"{prop}-left"] = $"{s.Left}px";
  }

  private static string MapAlignment(string value) => value switch
  {
    "start" => "flex-start",
    "end" => "flex-end",
    "space-between" => "space-between",
    "space-around" => "space-around",
    _ => value
  };

}
