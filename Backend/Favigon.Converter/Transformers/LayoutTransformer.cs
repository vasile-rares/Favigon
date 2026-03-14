using Favigon.Converter.Models;

namespace Favigon.Converter.Transformers;

public static class LayoutTransformer
{
  public static Dictionary<string, string> ToCssProperties(IRLayout layout)
  {
    var css = new Dictionary<string, string>(StringComparer.Ordinal);

    css["display"] = layout.Mode == LayoutMode.Grid ? "grid" : "flex";

    if (layout.Direction is not null)
      css["flex-direction"] = layout.Direction == FlexDirection.Column ? "column" : "row";

    if (layout.Align is not null) css["align-items"] = MapAlignItems(layout.Align.Value);
    if (layout.Justify is not null) css["justify-content"] = MapJustifyContent(layout.Justify.Value);
    if (layout.Gap is not null) css["gap"] = layout.Gap.ToString();
    if (layout.Wrap is not null) css["flex-wrap"] = layout.Wrap.Value ? "wrap" : "nowrap";

    if (layout.Mode == LayoutMode.Grid && layout.Columns is not null)
      css["grid-template-columns"] = $"repeat({layout.Columns}, minmax(0, 1fr))";
    if (layout.Mode == LayoutMode.Grid && layout.Rows is not null)
      css["grid-template-rows"] = $"repeat({layout.Rows}, minmax(0, 1fr))";

    return css;
  }

  private static string MapAlignItems(AlignItems value) => value switch
  {
    AlignItems.Start => "flex-start",
    AlignItems.End => "flex-end",
    AlignItems.Center => "center",
    AlignItems.Stretch => "stretch",
    _ => "stretch"
  };

  private static string MapJustifyContent(JustifyContent value) => value switch
  {
    JustifyContent.Start => "flex-start",
    JustifyContent.End => "flex-end",
    JustifyContent.Center => "center",
    JustifyContent.SpaceBetween => "space-between",
    JustifyContent.SpaceAround => "space-around",
    _ => "flex-start"
  };
}
