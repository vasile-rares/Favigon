using System.Text.RegularExpressions;
using Prismatic.Converter.Models;

namespace Prismatic.Converter.Validation;

public static class IrValidator
{
  private static readonly HashSet<string> KnownTypes =
  [
      "Frame", "Container", "Text", "Image"
  ];

  private static readonly HashSet<string> ValidLayoutModes = ["flex", "grid", "stack"];
  private static readonly HashSet<string> ValidDirections = ["row", "column"];
  private static readonly HashSet<string> ValidAlignments =
      ["start", "center", "end", "stretch", "space-between", "space-around", "baseline"];
  private static readonly HashSet<string> ValidWrapValues = ["nowrap", "wrap", "wrap-reverse"];
  private static readonly HashSet<string> ValidShadows = ["none", "sm", "md", "lg", "xl"];
  private static readonly HashSet<string> ValidBreakpoints = ["xs", "sm", "md", "lg", "xl", "2xl"];
  private static readonly HashSet<int> ValidFontWeights = [100, 200, 300, 400, 500, 600, 700, 800, 900];

  private static readonly Regex SupportedVersions = new(@"^1\.\d+$", RegexOptions.Compiled);

  private static readonly Regex CssColor = new(
      @"^(#([0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})" +
      @"|rgb\(.+\)|rgba\(.+\)|hsl\(.+\)|hsla\(.+\)|var\(--[a-zA-Z0-9_-]+\)|[a-zA-Z]+)$",
      RegexOptions.Compiled);

  private static readonly Regex CssSize = new(
      @"^(\d+(\.\d+)?(px|%|rem|em|vw|vh)|auto|100%)$",
      RegexOptions.Compiled);

  public static bool Validate(IRNode node)
  {
    return GetValidationErrors(node).Count == 0;
  }

  public static IReadOnlyList<string> GetValidationErrors(IRNode node)
  {
    var errors = new List<string>();
    var seenIds = new HashSet<string>();

    ValidateNode(node, path: "root", seenIds, errors);

    return errors;
  }

  private static void ValidateNode(
      IRNode node,
      string path,
      HashSet<string> seenIds,
      List<string> errors)
  {
    if (string.IsNullOrWhiteSpace(node.Version))
      errors.Add(Error(path, "version", "Version is required."));
    else if (!SupportedVersions.IsMatch(node.Version))
      errors.Add(Error(path, "version", $"Unsupported version '{node.Version}'. Expected 1.x."));

    if (string.IsNullOrWhiteSpace(node.Id))
      errors.Add(Error(path, "id", "Id is required."));
    else if (!seenIds.Add(node.Id))
      errors.Add(Error(path, "id", $"Duplicate node id '{node.Id}'."));

    if (string.IsNullOrWhiteSpace(node.Type))
      errors.Add(Error(path, "type", "Type is required."));
    else if (!KnownTypes.Contains(node.Type))
      errors.Add(Error(path, "type", $"Unknown component type '{node.Type}'."));

    if (node.Layout is not null)
      ValidateLayout(node.Layout, $"{path}.layout", errors);

    if (node.Style is not null)
      ValidateStyle(node.Style, $"{path}.style", errors);

    foreach (var (breakpoint, @override) in node.Responsive)
    {
      var overridePath = $"{path}.responsive.{breakpoint}";

      if (!ValidBreakpoints.Contains(breakpoint))
        errors.Add(Error(path, $"responsive.{breakpoint}", $"Unknown breakpoint '{breakpoint}'."));

      if (@override.Layout is not null)
        ValidateLayout(@override.Layout, $"{overridePath}.layout", errors);

      if (@override.Style is not null)
        ValidateStyle(@override.Style, $"{overridePath}.style", errors);
    }

    for (var i = 0; i < node.Children.Count; i++)
      ValidateNode(node.Children[i], $"{path}.children[{i}]", seenIds, errors);
  }

  private static void ValidateLayout(IRLayout layout, string path, List<string> errors)
  {
    if (!ValidLayoutModes.Contains(layout.Mode))
      errors.Add(Error(path, "mode", "Invalid layout mode '" + layout.Mode + "'. Must be: flex | grid | stack."));

    if (layout.Direction is not null && !ValidDirections.Contains(layout.Direction))
      errors.Add(Error(path, "direction", $"Invalid direction '{layout.Direction}'. Must be: row | column."));

    if (layout.Alignment is not null && !ValidAlignments.Contains(layout.Alignment))
      errors.Add(Error(path, "alignment", $"Invalid alignment '{layout.Alignment}'."));

    if (layout.Justify is not null && !ValidAlignments.Contains(layout.Justify))
      errors.Add(Error(path, "justify", $"Invalid justify '{layout.Justify}'."));

    if (layout.Wrap is not null && !ValidWrapValues.Contains(layout.Wrap))
      errors.Add(Error(path, "wrap", $"Invalid wrap '{layout.Wrap}'."));

    if (layout.Gap is < 0)
      errors.Add(Error(path, "gap", "Gap must be >= 0."));

    if (layout.Columns is < 1)
      errors.Add(Error(path, "columns", "Columns must be >= 1."));

    if (layout.Rows is < 1)
      errors.Add(Error(path, "rows", "Rows must be >= 1."));

    if (layout.Padding is not null)
      ValidateSpacing(layout.Padding, $"{path}.padding", errors);

    if (layout.Margin is not null)
      ValidateSpacing(layout.Margin, $"{path}.margin", errors);

    if (layout.Mode == "grid" && layout.Columns is null)
      errors.Add(Error(path, "columns", "Grid layout should specify 'columns'."));
  }

  private static void ValidateSpacing(IRSpacing spacing, string path, List<string> errors)
  {
    foreach (var (side, value) in new[]
    {
            ("top", spacing.Top),
            ("right", spacing.Right),
            ("bottom", spacing.Bottom),
            ("left", spacing.Left)
        })
    {
      if (value is < 0)
        errors.Add(Error(path, side, $"Spacing.{side} must be >= 0."));
    }
  }

  private static void ValidateStyle(IRStyle style, string path, List<string> errors)
  {
    ValidateColor(style.Color, path, "color", errors);
    ValidateColor(style.Background, path, "background", errors);

    if (style.BorderRadius is < 0)
      errors.Add(Error(path, "borderRadius", "borderRadius must be >= 0."));

    if (style.FontSize is < 0)
      errors.Add(Error(path, "fontSize", "fontSize must be >= 0."));

    if (style.FontWeight is not null && !ValidFontWeights.Contains(style.FontWeight.Value))
      errors.Add(Error(path, "fontWeight", $"Invalid fontWeight '{style.FontWeight}'. Must be 100–900 in steps of 100."));

    if (style.Shadow is not null && !ValidShadows.Contains(style.Shadow))
      errors.Add(Error(path, "shadow", $"Invalid shadow '{style.Shadow}'. Must be: none | sm | md | lg | xl."));

    if (style.Opacity is not null && (style.Opacity < 0 || style.Opacity > 1))
      errors.Add(Error(path, "opacity", "Opacity must be between 0 and 1."));

    ValidateCssSize(style.Width, path, "width", errors);
    ValidateCssSize(style.Height, path, "height", errors);
    ValidateCssSize(style.MinWidth, path, "minWidth", errors);
    ValidateCssSize(style.MaxWidth, path, "maxWidth", errors);
    ValidateCssSize(style.MinHeight, path, "minHeight", errors);
    ValidateCssSize(style.MaxHeight, path, "maxHeight", errors);
  }

  private static void ValidateColor(
      string? value, string path, string field, List<string> errors)
  {
    if (value is not null && !CssColor.IsMatch(value))
      errors.Add(Error(path, field, $"Invalid color value '{value}'."));
  }

  private static void ValidateCssSize(
      string? value, string path, string field, List<string> errors)
  {
    if (value is not null && !CssSize.IsMatch(value))
      errors.Add(Error(path, field, $"Invalid size value '{value}'. Expected px | % | rem | em | vw | vh | auto."));
  }

  private static string Error(string path, string field, string message) =>
    $"[{path}.{field}] {message}";
}
