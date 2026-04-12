using System.Text.Json.Serialization;

namespace Favigon.Converter.Models;

public class IRNode
{
  public string Id { get; set; } = "";
  public string Type { get; set; } = "";

  // HTML / component props
  public Dictionary<string, object?> Props { get; set; } = new();

  // Layout inside parent
  public IRLayout? Layout { get; set; }

  // Visual styling
  public IRStyle? Style { get; set; }

  // Absolute / relative positioning
  public IRPosition? Position { get; set; }

  // Responsive overrides (mobile, tablet, etc)
  public Dictionary<string, IRVariant> Variants { get; set; } = new();

  // Children
  public List<IRNode> Children { get; set; } = new();

  // Editor-only metadata
  public IRMeta Meta { get; set; } = new();

  // CSS animation effect
  public List<IREffect>? Effects { get; set; }
}

public class IREffect
{
  public string Preset { get; set; } = "";
  public string Trigger { get; set; } = "onLoad"; // onLoad | hover | click | focus | loop
  public double? Opacity { get; set; }
  public double? Scale { get; set; }
  public double? Rotate { get; set; }
  public string RotationMode { get; set; } = "2d";
  public double? SkewX { get; set; }
  public double? SkewY { get; set; }
  public double? OffsetX { get; set; }
  public double? OffsetY { get; set; }
  public string? Fill { get; set; }
  public string? Shadow { get; set; }
  public int Duration { get; set; } = 500;
  public int Delay { get; set; } = 0;
  public string Iterations { get; set; } = "1";
  public string Easing { get; set; } = "ease";
  public string Direction { get; set; } = "normal";
  public string FillMode { get; set; } = "forwards";
  public string OffScreenBehavior { get; set; } = "play";
}

public class IRLayout
{
  public LayoutMode Mode { get; set; } = LayoutMode.Flex;

  // Flex
  public FlexDirection? Direction { get; set; }
  public AlignItems? Align { get; set; }
  public JustifyContent? Justify { get; set; }
  public IRLength? Gap { get; set; }
  public IRLength? RowGap { get; set; }
  public IRLength? ColumnGap { get; set; }
  public bool? Wrap { get; set; }

  // Grid
  public int? Columns { get; set; }
  public int? Rows { get; set; }
  public string? GridTemplateColumns { get; set; }
  public string? GridTemplateRows { get; set; }
}

public class IRPosition
{
  public PositionMode Mode { get; set; } = PositionMode.Flow;

  public IRLength? Top { get; set; }
  public IRLength? Right { get; set; }
  public IRLength? Bottom { get; set; }
  public IRLength? Left { get; set; }
}

public class IRStyle
{
  public string? Color { get; set; }
  public string? Background { get; set; }
  public string? BackgroundImage { get; set; }
  public string? BackgroundSize { get; set; }
  public string? BackgroundPosition { get; set; }
  public string? BackgroundRepeat { get; set; }
  public string? ObjectFit { get; set; }
  public string? Transform { get; set; }
  public string? TransformOrigin { get; set; }
  public string? BackfaceVisibility { get; set; }
  public string? TransformStyle { get; set; }

  public IRLength? Width { get; set; }
  public IRLength? Height { get; set; }

  public IRLength? MinWidth { get; set; }
  public IRLength? MaxWidth { get; set; }

  public IRLength? MinHeight { get; set; }
  public IRLength? MaxHeight { get; set; }

  public IRLength? FontSize { get; set; }
  public int? FontWeight { get; set; }
  public string? FontFamily { get; set; }
  public string? FontStyle { get; set; }
  public IRLength? LineHeight { get; set; }
  public IRLength? LetterSpacing { get; set; }

  public string? TextAlign { get; set; }

  public IRLength? BorderRadius { get; set; }
  public IRLength? BorderTopLeftRadius { get; set; }
  public IRLength? BorderTopRightRadius { get; set; }
  public IRLength? BorderBottomRightRadius { get; set; }
  public IRLength? BorderBottomLeftRadius { get; set; }
  public IRBorder? Border { get; set; }

  public OverflowMode? Overflow { get; set; }
  public List<IRShadow>? Shadows { get; set; }

  public double? Opacity { get; set; }

  public string? Cursor { get; set; }

  public IRSpacing? Padding { get; set; }
  public IRSpacing? Margin { get; set; }
}

public class IRShadow
{
  public bool Inset { get; set; }
  public double X { get; set; }
  public double Y { get; set; }
  public double Blur { get; set; }
  public double Spread { get; set; }
  public string Color { get; set; } = "rgba(0,0,0,0.1)";

  public string ToCss()
  {
    var prefix = Inset ? "inset " : "";
    return $"{prefix}{X}px {Y}px {Blur}px {Spread}px {Color}";
  }
}

public class IRSpacing
{
  public IRLength? Top { get; set; }
  public IRLength? Right { get; set; }
  public IRLength? Bottom { get; set; }
  public IRLength? Left { get; set; }
}

public class IRBorder
{
  public IRLength? Width { get; set; }
  public string? Color { get; set; }
  public BorderStyle Style { get; set; } = BorderStyle.Solid;
  public IRLength? TopWidth { get; set; }
  public IRLength? RightWidth { get; set; }
  public IRLength? BottomWidth { get; set; }
  public IRLength? LeftWidth { get; set; }

  // Selective sides — if all are null the border applies to all four sides
  public bool? Top { get; set; }
  public bool? Right { get; set; }
  public bool? Bottom { get; set; }
  public bool? Left { get; set; }
}

public class IRLength
{
  public double Value { get; set; }
  public string Unit { get; set; } = "px";

  public override string ToString() => $"{Value}{Unit}";
}

public class IRVariant
{
  public IRLayout? Layout { get; set; }
  public IRStyle? Style { get; set; }
  public Dictionary<string, object?>? Props { get; set; }
}

public class IRMeta
{
  public string? Name { get; set; }
  public bool Hidden { get; set; }
  public string? ComponentInstanceId { get; set; }
}

[JsonConverter(typeof(JsonStringEnumConverter))]
public enum OverflowMode
{
  Clip,
  Visible,
  Hidden,
  Scroll
}

[JsonConverter(typeof(JsonStringEnumConverter))]
public enum LayoutMode
{
  Block,
  Flex,
  Grid
}

[JsonConverter(typeof(JsonStringEnumConverter))]
public enum PositionMode
{
  Flow,
  Relative,
  Absolute,
  Fixed,
  Sticky
}

[JsonConverter(typeof(JsonStringEnumConverter))]
public enum FlexDirection
{
  Row,
  Column,
  RowReverse,
  ColumnReverse
}

[JsonConverter(typeof(JsonStringEnumConverter))]
public enum AlignItems
{
  Start,
  Center,
  End,
  Stretch,
  Baseline
}

[JsonConverter(typeof(JsonStringEnumConverter))]
public enum JustifyContent
{
  Start,
  Center,
  End,
  SpaceBetween,
  SpaceAround,
  SpaceEvenly
}

[JsonConverter(typeof(JsonStringEnumConverter))]
public enum BorderStyle
{
  Solid,
  Dashed,
  Dotted,
  Double,
  None
}
