using System.Text.Json;

namespace Prismatic.Converter.Models;

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

public class IRLayout
{
  public string Mode { get; set; } = "flex";
  public string? Direction { get; set; }
  public string? Alignment { get; set; }
  public string? Justify { get; set; }
  public double? Gap { get; set; }
  public IRSpacing? Padding { get; set; }
  public IRSpacing? Margin { get; set; }
  public string? Wrap { get; set; }
  public int? Columns { get; set; }
  public int? Rows { get; set; }
}

public class IRSpacing
{
  public double? Top { get; set; }
  public double? Right { get; set; }
  public double? Bottom { get; set; }
  public double? Left { get; set; }
}

public class IRStyle
{
  public string? Color { get; set; }
  public string? Background { get; set; }
  public double? BorderRadius { get; set; }
  public double? FontSize { get; set; }
  public int? FontWeight { get; set; }
  public string? FontFamily { get; set; }
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

public class IRResponsiveOverride
{
  public IRLayout? Layout { get; set; }
  public IRStyle? Style { get; set; }
  public Dictionary<string, JsonElement>? Props { get; set; }
}