using System.Text.Json;
using Favigon.Converter.Models;

namespace Favigon.Converter.Parsers.Canvas;

public sealed class CanvasParser
{
  public IRNode Parse(string input)
  {
    if (string.IsNullOrWhiteSpace(input))
      throw new ArgumentException("Canvas payload is required.");

    var elements = ParseElements(input);

    return new IRNode
    {
      Id = "canvas-root",
      Type = "Container",
      Layout = new IRLayout
      {
        Mode = LayoutMode.Flex,
        Direction = FlexDirection.Column,
        Gap = new IRLength { Value = 8 }
      },
      Children = elements.Select(ToIrNode).ToList()
    };
  }

  private static IReadOnlyList<CanvasElementDto> ParseElements(string input)
  {
    using var document = JsonDocument.Parse(input);
    var root = document.RootElement;

    if (root.ValueKind == JsonValueKind.Array)
      return JsonSerializer.Deserialize<List<CanvasElementDto>>(root.GetRawText()) ?? [];

    if (root.ValueKind == JsonValueKind.Object && root.TryGetProperty("elements", out var elementsProperty))
      return JsonSerializer.Deserialize<List<CanvasElementDto>>(elementsProperty.GetRawText()) ?? [];

    throw new ArgumentException("Invalid canvas payload format. Expected array or object with 'elements'.");
  }

  private static IRNode ToIrNode(CanvasElementDto element)
  {
    var style = new IRStyle
    {
      Width = new IRLength { Value = Math.Max(element.Width, 0) },
      Height = new IRLength { Value = Math.Max(element.Height, 0) }
    };

    if (!string.IsNullOrWhiteSpace(element.Fill))
      style.Background = element.Fill;

    if (!string.IsNullOrWhiteSpace(element.Stroke))
      style.Border = new IRBorder
      {
        Width = new IRLength { Value = 1 },
        Color = element.Stroke,
        Style = BorderStyle.Solid
      };

    var position = new IRPosition
    {
      Mode = PositionMode.Absolute,
      X = new IRLength { Value = element.X },
      Y = new IRLength { Value = element.Y }
    };

    if (string.Equals(element.Type, "text", StringComparison.OrdinalIgnoreCase))
    {
      if (element.FontSize is not null)
        style.FontSize = new IRLength { Value = element.FontSize.Value };

      if (!string.IsNullOrWhiteSpace(element.Fill))
      {
        style.Color = element.Fill;
        style.Background = null;
      }

      return new IRNode
      {
        Id = string.IsNullOrWhiteSpace(element.Id) ? Guid.NewGuid().ToString("N") : element.Id,
        Type = "Text",
        Style = style,
        Position = position,
        Props = new Dictionary<string, object?> { ["content"] = element.Text ?? string.Empty }
      };
    }

    return new IRNode
    {
      Id = string.IsNullOrWhiteSpace(element.Id) ? Guid.NewGuid().ToString("N") : element.Id,
      Type = "Container",
      Style = style,
      Position = position
    };
  }

  private sealed class CanvasElementDto
  {
    public string? Id { get; set; }
    public string Type { get; set; } = "rectangle";
    public double X { get; set; }
    public double Y { get; set; }
    public double Width { get; set; }
    public double Height { get; set; }
    public string? Fill { get; set; }
    public string? Stroke { get; set; }
    public string? Text { get; set; }
    public double? FontSize { get; set; }
  }
}
