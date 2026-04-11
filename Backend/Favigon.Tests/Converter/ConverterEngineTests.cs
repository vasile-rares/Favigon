using Favigon.Converter;
using Favigon.Converter.Models;

namespace Favigon.Tests.Converter;

public class ConverterEngineTests
{
  [Fact]
  public void GenerateMultiPage_HtmlNormalizesCanvasRootAndViewportFrameNames()
  {
    var sut = new ConverterEngine();
    var root = new IRNode
    {
      Id = "canvas-project-123",
      Type = "Container",
      Props = new Dictionary<string, object?>
      {
        ["role"] = "canvas-root",
        ["pageName"] = "Home"
      },
      Layout = new IRLayout
      {
        Mode = LayoutMode.Flex,
        Direction = FlexDirection.Column
      },
      Style = new IRStyle
      {
        Width = new IRLength { Value = 100, Unit = "%" },
        Height = new IRLength { Value = 100, Unit = "%" }
      },
      Children =
      [
        new IRNode
        {
          Id = "frame-home",
          Type = "Frame",
          // Canvas-level position that must NOT appear in exported CSS for .page
          Position = new IRPosition
          {
            Mode = PositionMode.Absolute,
            Left = new IRLength { Value = 800, Unit = "px" },
            Top = new IRLength { Value = 500, Unit = "px" }
          },
          Style = new IRStyle
          {
            Width = new IRLength { Value = 1280, Unit = "px" },
            Height = new IRLength { Value = 720, Unit = "px" }
          },
          Meta = new IRMeta
          {
            Name = "Desktop"
          }
        }
      ]
    };

    var files = sut.GenerateMultiPage(
      [
        ("Home", 1280, root)
      ],
      "html");

    var homeHtml = Assert.Single(files, file => file.Path == "home.html");
    var homeCss = Assert.Single(files, file => file.Path == "home.css");

    Assert.Contains("class=\"page\"", homeHtml.Content);
    Assert.DoesNotContain("class=\"desktop\"", homeHtml.Content, StringComparison.OrdinalIgnoreCase);
    Assert.DoesNotContain("container-project-123", homeHtml.Content, StringComparison.OrdinalIgnoreCase);

    Assert.Contains(".page", homeCss.Content);
    Assert.DoesNotContain(".desktop", homeCss.Content, StringComparison.OrdinalIgnoreCase);
    Assert.DoesNotContain(".container-project-123", homeCss.Content, StringComparison.OrdinalIgnoreCase);

    // .page must be position: relative (containing block) with no canvas coordinates
    Assert.Contains("position: relative", homeCss.Content);
    Assert.DoesNotContain("position: absolute", homeCss.Content);
    Assert.DoesNotContain("left:", homeCss.Content);
    Assert.DoesNotContain("top:", homeCss.Content);
  }

  [Fact]
  public void GenerateMultiPage_HtmlUsesUniqueScopedClassesForDuplicateNames()
  {
    var sut = new ConverterEngine();
    var root = new IRNode
    {
      Id = "canvas-project-456",
      Type = "Container",
      Props = new Dictionary<string, object?>
      {
        ["role"] = "canvas-root",
        ["pageName"] = "Home"
      },
      Children =
      [
        new IRNode
        {
          Id = "frame-home",
          Type = "Frame",
          Meta = new IRMeta
          {
            Name = "Desktop"
          },
          Children =
          [
            new IRNode
            {
              Id = "rect-a",
              Type = "Container",
              Meta = new IRMeta
              {
                Name = "Rectangle"
              },
              Style = new IRStyle
              {
                Width = new IRLength { Value = 120, Unit = "px" },
                Height = new IRLength { Value = 80, Unit = "px" }
              }
            },
            new IRNode
            {
              Id = "rect-b",
              Type = "Container",
              Meta = new IRMeta
              {
                Name = "Rectangle"
              },
              Style = new IRStyle
              {
                Width = new IRLength { Value = 200, Unit = "px" },
                Height = new IRLength { Value = 100, Unit = "px" }
              }
            }
          ]
        }
      ]
    };

    var files = sut.GenerateMultiPage(
      [
        ("Home", 1280, root)
      ],
      "html");

    var homeHtml = Assert.Single(files, file => file.Path == "home.html");
    var homeCss = Assert.Single(files, file => file.Path == "home.css");

    Assert.Contains("rect rect-1", homeHtml.Content);
    Assert.Contains("rect rect-2", homeHtml.Content);

    Assert.Contains(".rect-1", homeCss.Content);
    Assert.Contains(".rect-2", homeCss.Content);

    var debugMap = Assert.Single(files, file => file.Path == "debug/home.class-map.json");
    Assert.Contains("\"id\": \"rect-a\"", debugMap.Content);
    Assert.Contains("\"htmlTag\": \"div\"", debugMap.Content);
    Assert.Contains("\"markupClass\": \"rect rect-1\"", debugMap.Content);
    Assert.Contains("\"cssSelector\": \".rect-1\"", debugMap.Content);
  }

  [Fact]
  public void GenerateMultiPage_CssOmitsDefaultOpacityAndZeroBorderRadius()
  {
    var sut = new ConverterEngine();
    var root = new IRNode
    {
      Id = "canvas-project-defaults",
      Type = "Container",
      Props = new Dictionary<string, object?> { ["role"] = "canvas-root" },
      Children =
      [
        new IRNode
        {
          Id = "rect-default",
          Type = "Container",
          Meta = new IRMeta { Name = "Box" },
          Style = new IRStyle
          {
            Width = new IRLength { Value = 100, Unit = "px" },
            Height = new IRLength { Value = 100, Unit = "px" },
            Opacity = 1.0,
            BorderRadius = new IRLength { Value = 0, Unit = "px" }
          }
        },
        new IRNode
        {
          Id = "rect-custom",
          Type = "Container",
          Meta = new IRMeta { Name = "Custom" },
          Style = new IRStyle
          {
            Width = new IRLength { Value = 80, Unit = "px" },
            Height = new IRLength { Value = 80, Unit = "px" },
            Opacity = 0.5,
            BorderRadius = new IRLength { Value = 8, Unit = "px" }
          }
        }
      ]
    };

    var files = sut.GenerateMultiPage([("Page", 1280, root)], "html");

    var css = Assert.Single(files, f => f.Path == "page.css");

    // Default values must NOT appear
    Assert.DoesNotContain("opacity: 1", css.Content);
    Assert.DoesNotContain("border-radius: 0", css.Content);

    // Non-default values MUST appear
    Assert.Contains("opacity: 0.5", css.Content);
    Assert.Contains("border-radius: 8px", css.Content);
  }

  [Fact]
  public void GenerateMultiPage_HtmlEmitsOverflowFromStyle()
  {
    var sut = new ConverterEngine();
    var root = new IRNode
    {
      Id = "canvas-project-789",
      Type = "Container",
      Props = new Dictionary<string, object?>
      {
        ["role"] = "canvas-root",
        ["pageName"] = "Home"
      },
      Children =
      [
        new IRNode
        {
          Id = "frame-home",
          Type = "Frame",
          Meta = new IRMeta
          {
            Name = "Desktop"
          },
          Style = new IRStyle
          {
            Width = new IRLength { Value = 1280, Unit = "px" },
            Height = new IRLength { Value = 720, Unit = "px" },
            Overflow = OverflowMode.Clip
          }
        }
      ]
    };

    var files = sut.GenerateMultiPage(
      [
        ("Home", 1280, root)
      ],
      "html");

    var homeCss = Assert.Single(files, file => file.Path == "home.css");
    Assert.Contains("overflow: clip;", homeCss.Content);
  }

  [Fact]
  public void GenerateMultiPage_HtmlEmitsScrollOverflowFromStyle()
  {
    var sut = new ConverterEngine();
    var root = new IRNode
    {
      Id = "canvas-project-overflow-scroll",
      Type = "Container",
      Props = new Dictionary<string, object?>
      {
        ["role"] = "canvas-root",
        ["pageName"] = "Scrollable"
      },
      Children =
      [
        new IRNode
        {
          Id = "frame-scroll",
          Type = "Frame",
          Meta = new IRMeta
          {
            Name = "Scrollable Frame"
          },
          Style = new IRStyle
          {
            Width = new IRLength { Value = 1280, Unit = "px" },
            Height = new IRLength { Value = 720, Unit = "px" },
            Overflow = OverflowMode.Scroll
          }
        }
      ]
    };

    var files = sut.GenerateMultiPage(
      [
        ("Scrollable", 1280, root)
      ],
      "html");

    var css = Assert.Single(files, file => file.Path == "scrollable.css");
    Assert.Contains("overflow: scroll;", css.Content);
  }
}