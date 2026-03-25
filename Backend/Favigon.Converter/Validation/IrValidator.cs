using System.Text.RegularExpressions;
using Favigon.Converter.Models;

namespace Favigon.Converter.Validation;

public static class IrValidator
{
  private static readonly HashSet<string> KnownTypes =
  [
      "Frame", "Container", "Text", "Image"
  ];

  private static readonly HashSet<string> ValidOverflow = ["clip", "visible"];
  private static readonly HashSet<string> ValidShadows = ["none", "sm", "md", "lg", "xl"];
  private static readonly HashSet<string> ValidBreakpoints = ["xs", "sm", "md", "lg", "xl", "2xl"];
  private static readonly HashSet<int> ValidFontWeights = [100, 200, 300, 400, 500, 600, 700, 800, 900];
  private static readonly HashSet<string> ValidUnits = ["px", "%", "rem", "em", "vw", "vh"];

  private static readonly Regex CssColor = new(
      @"^(#([0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})" +
      @"|rgb\(.+\)|rgba\(.+\)|hsl\(.+\)|hsla\(.+\)|var\(--[a-zA-Z0-9_-]+\)|[a-zA-Z]+)$",
      RegexOptions.Compiled);

  public static bool Validate(IRNode node) => GetValidationErrors(node).Count == 0;

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

    foreach (var (key, variant) in node.Variants)
    {
      var variantPath = $"{path}.variants.{key}";

      if (!ValidBreakpoints.Contains(key))
        errors.Add(Error(path, $"variants.{key}", $"Unknown variant key '{key}'."));

      if (variant.Layout is not null)
        ValidateLayout(variant.Layout, $"{variantPath}.layout", errors);

      if (variant.Style is not null)
        ValidateStyle(variant.Style, $"{variantPath}.style", errors);
    }

    for (var i = 0; i < node.Children.Count; i++)
      ValidateNode(node.Children[i], $"{path}.children[{i}]", seenIds, errors);
  }

  private static void ValidateLayout(IRLayout layout, string path, List<string> errors)
  {
    if (layout.Gap is not null) ValidateLength(layout.Gap, path, "gap", errors, allowNegative: false);
    if (layout.Columns is < 1) errors.Add(Error(path, "columns", "Columns must be >= 1."));
    if (layout.Rows is < 1) errors.Add(Error(path, "rows", "Rows must be >= 1."));
    if (layout.Mode == LayoutMode.Grid && layout.Columns is null)
      errors.Add(Error(path, "columns", "Grid layout should specify 'columns'."));
  }

  private static void ValidateStyle(IRStyle style, string path, List<string> errors)
  {
    ValidateColor(style.Color, path, "color", errors);
    ValidateColor(style.Background, path, "background", errors);

    ValidateOptionalLength(style.BorderRadius, path, "borderRadius", errors, allowNegative: false);
    if (style.Border is not null) ValidateBorder(style.Border, $"{path}.border", errors);
    ValidateOptionalLength(style.FontSize, path, "fontSize", errors, allowNegative: false);

    if (style.FontWeight is not null && !ValidFontWeights.Contains(style.FontWeight.Value))
      errors.Add(Error(path, "fontWeight", $"Invalid fontWeight '{style.FontWeight}'. Must be 100–900 in steps of 100."));

    if (style.Shadow is not null && !ValidShadows.Contains(style.Shadow))
      errors.Add(Error(path, "shadow", $"Invalid shadow '{style.Shadow}'. Must be: none | sm | md | lg | xl."));

    if (style.Overflow is not null && !ValidOverflow.Contains(style.Overflow))
      errors.Add(Error(path, "overflow", $"Invalid overflow '{style.Overflow}'. Must be: clip | visible."));

    if (style.Opacity is not null && (style.Opacity < 0 || style.Opacity > 1))
      errors.Add(Error(path, "opacity", "Opacity must be between 0 and 1."));

    ValidateOptionalLength(style.Width, path, "width", errors);
    ValidateOptionalLength(style.Height, path, "height", errors);
    ValidateOptionalLength(style.MinWidth, path, "minWidth", errors);
    ValidateOptionalLength(style.MaxWidth, path, "maxWidth", errors);
    ValidateOptionalLength(style.MinHeight, path, "minHeight", errors);
    ValidateOptionalLength(style.MaxHeight, path, "maxHeight", errors);
    ValidateOptionalLength(style.LineHeight, path, "lineHeight", errors);
    ValidateOptionalLength(style.LetterSpacing, path, "letterSpacing", errors);

    if (style.Padding is not null) ValidateSpacing(style.Padding, $"{path}.padding", errors);
    if (style.Margin is not null) ValidateSpacing(style.Margin, $"{path}.margin", errors);
  }

  private static void ValidateBorder(IRBorder border, string path, List<string> errors)
  {
    ValidateOptionalLength(border.Width, path, "width", errors, allowNegative: false);
    ValidateColor(border.Color, path, "color", errors);
  }

  private static void ValidateSpacing(IRSpacing spacing, string path, List<string> errors)
  {
    ValidateOptionalLength(spacing.Top, path, "top", errors);
    ValidateOptionalLength(spacing.Right, path, "right", errors);
    ValidateOptionalLength(spacing.Bottom, path, "bottom", errors);
    ValidateOptionalLength(spacing.Left, path, "left", errors);
  }

  private static void ValidateOptionalLength(
    IRLength? len, string path, string field, List<string> errors, bool allowNegative = true)
  {
    if (len is not null) ValidateLength(len, path, field, errors, allowNegative);
  }

  private static void ValidateLength(
    IRLength len, string path, string field, List<string> errors, bool allowNegative = true)
  {
    if (!allowNegative && len.Value < 0)
      errors.Add(Error(path, field, $"{field} value must be >= 0."));

    if (!ValidUnits.Contains(len.Unit))
      errors.Add(Error(path, field, $"Invalid unit '{len.Unit}' for {field}. Must be: px | % | rem | em | vw | vh."));
  }

  private static void ValidateColor(string? value, string path, string field, List<string> errors)
  {
    if (value is not null && !CssColor.IsMatch(value))
      errors.Add(Error(path, field, $"Invalid color value '{value}'."));
  }

  private static string Error(string path, string field, string message) =>
    $"[{path}.{field}] {message}";
}
