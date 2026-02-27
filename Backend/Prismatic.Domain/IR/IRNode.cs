using System.Text.Json;

namespace Prismatic.Domain.IR;

/// <summary>
/// Root IR node — single source of truth produced by the canvas.
/// Framework-agnostic; consumed by the code generation pipeline.
/// </summary>
public class IRNode
{
    public string Version { get; set; } = "1.0";
    public string Id { get; set; } = string.Empty;
    public string Type { get; set; } = string.Empty;
    public Dictionary<string, JsonElement> Props { get; set; } = [];
    public IRLayout? Layout { get; set; }
    public IRStyle? Style { get; set; }
    public Dictionary<string, IRResponsiveOverride> Responsive { get; set; } = [];
    public List<IRNode> Children { get; set; } = [];
}

/// <summary>
/// Layout descriptor: flex / grid / stack, with alignment and spacing.
/// </summary>
public class IRLayout
{
    /// <summary>flex | grid | stack</summary>
    public string Mode { get; set; } = "flex";

    /// <summary>row | column</summary>
    public string? Direction { get; set; }

    /// <summary>start | center | end | stretch | space-between | space-around</summary>
    public string? Alignment { get; set; }

    /// <summary>start | center | end | stretch | space-between | space-around</summary>
    public string? Justify { get; set; }

    public double? Gap { get; set; }
    public IRSpacing? Padding { get; set; }
    public IRSpacing? Margin { get; set; }

    /// <summary>nowrap | wrap | wrap-reverse</summary>
    public string? Wrap { get; set; }

    // Grid-specific
    public int? Columns { get; set; }
    public int? Rows { get; set; }
}

/// <summary>
/// Four-sided spacing (padding or margin), all values in px.
/// </summary>
public class IRSpacing
{
    public double? Top { get; set; }
    public double? Right { get; set; }
    public double? Bottom { get; set; }
    public double? Left { get; set; }
}

/// <summary>
/// Essential visual styles — framework-agnostic tokens.
/// </summary>
public class IRStyle
{
    public string? Color { get; set; }
    public string? Background { get; set; }
    public double? BorderRadius { get; set; }
    public double? FontSize { get; set; }
    public int? FontWeight { get; set; }
    public string? FontFamily { get; set; }

    /// <summary>none | sm | md | lg | xl</summary>
    public string? Shadow { get; set; }
    public string? Border { get; set; }
    public double? Opacity { get; set; }
    public string? Width { get; set; }
    public string? Height { get; set; }
    public string? MinWidth { get; set; }
    public string? MaxWidth { get; set; }
    public string? MinHeight { get; set; }
    public string? MaxHeight { get; set; }
}

/// <summary>
/// Partial overrides applied at a specific responsive breakpoint (e.g. "md", "lg").
/// </summary>
public class IRResponsiveOverride
{
    public IRLayout? Layout { get; set; }
    public IRStyle? Style { get; set; }
    public Dictionary<string, JsonElement>? Props { get; set; }
}
