using Favigon.Converter.Abstractions;
using Favigon.Converter.Generators.Angular;
using Favigon.Converter.Generators.Html;
using Favigon.Converter.Generators.React;
using Favigon.Converter.Models;
using Favigon.Converter.Parsers.Canvas;
using Favigon.Converter.Transformers;
using Favigon.Converter.Utils;
using Favigon.Converter.Validation;

namespace Favigon.Converter;

public sealed class ConverterEngine : IConverterEngine
{
  private static readonly CanvasParser CanvasParser = new();

  private static readonly IReadOnlyDictionary<string, IReadOnlyDictionary<string, IComponentMapper>> FrameworkMappers =
    new Dictionary<string, IReadOnlyDictionary<string, IComponentMapper>>(StringComparer.OrdinalIgnoreCase)
    {
      ["html"] = CreateMap(HtmlMapperCatalog.Create()),
      ["react"] = CreateMap(ReactMapperCatalog.Create()),
      ["angular"] = CreateMap(AngularMapperCatalog.Create())
    };


  public (string Html, string Css) GenerateFromCanvas(string canvasJson, string framework)
  {
    var root = ParseCanvas(canvasJson);
    return Generate(root, framework);
  }

  public (string Html, string Css) Generate(IRNode root, string framework)
  {
    if (!Validate(root))
      throw new InvalidOperationException("IR validation failed.");

    var frameworkMappers = ResolveFrameworkMappers(framework);

    var styles = new StyleBuilder();
    var context = new EmitContext
    {
      Framework = framework,
      Depth = 0,
      Styles = styles,
      EmitChild = (node, childContext) => EmitNode(node, childContext, framework, frameworkMappers)
    };

    var html = EmitNode(root, context, framework, frameworkMappers);
    var css = styles.Build();

    return (html, css);
  }

  public bool Validate(IRNode root) => IrValidator.Validate(root);

  private static string EmitNode(
    IRNode node,
    EmitContext ctx,
    string framework,
    IReadOnlyDictionary<string, IComponentMapper> frameworkMappers)
  {
    if (!frameworkMappers.TryGetValue(node.Type, out var mapper))
      throw new InvalidOperationException(
          $"No mapper registered for component type '{node.Type}' in framework '{framework}'.");

    return mapper.Emit(node, ctx);
  }

  private static IReadOnlyDictionary<string, IComponentMapper> ResolveFrameworkMappers(string framework)
  {
    if (FrameworkMappers.TryGetValue(framework, out var mappers))
      return mappers;

    throw new ArgumentException(
      $"Unsupported framework '{framework}'. Supported frameworks: {string.Join(", ", FrameworkMappers.Keys)}.");
  }

  private static IReadOnlyDictionary<string, IComponentMapper> CreateMap(IEnumerable<IComponentMapper> mappers)
  {
    var map = new Dictionary<string, IComponentMapper>(StringComparer.OrdinalIgnoreCase);
    foreach (var mapper in mappers)
      map[mapper.Type] = mapper;

    return map;
  }
  public IRNode ParseCanvas(string canvasJson) => CanvasParser.Parse(canvasJson);

}
