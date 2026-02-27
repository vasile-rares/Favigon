using System.Text.RegularExpressions;

namespace Prismatic.Domain.IR;

/// <summary>
/// Validates an IR tree and returns a structured result with all collected errors.
/// </summary>
public static class IRValidator
{
    // ── Known abstract component types ───────────────────────────────────────
    private static readonly HashSet<string> KnownTypes =
    [
        "Button", "Input", "Textarea", "Select", "Checkbox", "Radio", "Toggle",
        "Text", "Heading", "Link", "Image", "Icon",
        "Card", "Stack", "Row", "Column", "Grid", "Container", "Divider",
        "Navbar", "Sidebar", "Modal", "Drawer", "Tooltip", "Badge", "Avatar",
        "Table", "List", "Form", "Tabs", "Accordion", "Breadcrumb", "Pagination"
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

    // ── CSS color: #rgb | #rrggbb | #rrggbbaa | rgb() | rgba() | hsl() | named
    private static readonly Regex CssColor = new(
        @"^(#([0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})" +
        @"|rgb\(.+\)|rgba\(.+\)|hsl\(.+\)|hsla\(.+\)|[a-zA-Z]+)$",
        RegexOptions.Compiled);

    // ── CSS size value: px | % | rem | em | vw | vh | auto ───────────────────
    private static readonly Regex CssSize = new(
        @"^(\d+(\.\d+)?(px|%|rem|em|vw|vh)|auto|100%)$",
        RegexOptions.Compiled);

    // ─────────────────────────────────────────────────────────────────────────

    /// <summary>
    /// Validates the full IR tree. Collects all errors (does not stop at first).
    /// </summary>
    public static IRValidationResult Validate(IRNode node)
    {
        var errors = new List<IRValidationError>();
        var seenIds = new HashSet<string>();

        ValidateNode(node, path: "root", seenIds, errors);

        return new IRValidationResult(errors);
    }

    // ── Node ─────────────────────────────────────────────────────────────────

    private static void ValidateNode(
        IRNode node,
        string path,
        HashSet<string> seenIds,
        List<IRValidationError> errors)
    {
        // Version
        if (string.IsNullOrWhiteSpace(node.Version))
            errors.Add(Error(path, "version", "Version is required."));
        else if (!SupportedVersions.IsMatch(node.Version))
            errors.Add(Error(path, "version", $"Unsupported version '{node.Version}'. Expected 1.x."));

        // Id
        if (string.IsNullOrWhiteSpace(node.Id))
            errors.Add(Error(path, "id", "Id is required."));
        else if (!seenIds.Add(node.Id))
            errors.Add(Error(path, "id", $"Duplicate node id '{node.Id}'."));

        // Type
        if (string.IsNullOrWhiteSpace(node.Type))
            errors.Add(Error(path, "type", "Type is required."));
        else if (!KnownTypes.Contains(node.Type))
            errors.Add(Error(path, "type", $"Unknown component type '{node.Type}'."));

        // Layout
        if (node.Layout is not null)
            ValidateLayout(node.Layout, $"{path}.layout", errors);

        // Style
        if (node.Style is not null)
            ValidateStyle(node.Style, $"{path}.style", errors);

        // Responsive overrides
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

        // Children
        for (var i = 0; i < node.Children.Count; i++)
            ValidateNode(node.Children[i], $"{path}.children[{i}]", seenIds, errors);
    }

    // ── Layout ───────────────────────────────────────────────────────────────

    private static void ValidateLayout(IRLayout layout, string path, List<IRValidationError> errors)
    {
        if (!ValidLayoutModes.Contains(layout.Mode))
            errors.Add(Error(path, "mode", $"Invalid layout mode '{layout.Mode}'. Must be: flex | grid | stack."));

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

    // ── Spacing ───────────────────────────────────────────────────────────────

    private static void ValidateSpacing(IRSpacing spacing, string path, List<IRValidationError> errors)
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

    // ── Style ─────────────────────────────────────────────────────────────────

    private static void ValidateStyle(IRStyle style, string path, List<IRValidationError> errors)
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

    // ── Helpers ───────────────────────────────────────────────────────────────

    private static void ValidateColor(
        string? value, string path, string field, List<IRValidationError> errors)
    {
        if (value is not null && !CssColor.IsMatch(value))
            errors.Add(Error(path, field, $"Invalid color value '{value}'."));
    }

    private static void ValidateCssSize(
        string? value, string path, string field, List<IRValidationError> errors)
    {
        if (value is not null && !CssSize.IsMatch(value))
            errors.Add(Error(path, field, $"Invalid size value '{value}'. Expected px | % | rem | em | vw | vh | auto."));
    }

    private static IRValidationError Error(string path, string field, string message) =>
        new($"{path}.{field}", message);
}

// ── Result types ──────────────────────────────────────────────────────────────

/// <summary>
/// Result of IR validation. IsValid = true when there are no errors.
/// </summary>
public sealed record IRValidationResult(IReadOnlyList<IRValidationError> Errors)
{
    public bool IsValid => Errors.Count == 0;

    public override string ToString() =>
        IsValid
            ? "IR is valid."
            : $"{Errors.Count} validation error(s):\n" +
              string.Join("\n", Errors.Select(e => $"  [{e.Path}] {e.Message}"));
}

/// <summary>
/// A single validation error with location path and description.
/// </summary>
public sealed record IRValidationError(string Path, string Message);
