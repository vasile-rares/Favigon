using System.Text;
using System.Text.Json;
using Prismatic.Converter.Abstractions;
using Prismatic.Converter.Models;
using Prismatic.Converter.Transformers;
using Prismatic.Converter.Utils;

namespace Prismatic.Converter.Generators;

public abstract class FrameworkMapperBase : IComponentMapper
{
  public abstract string Type { get; }

  protected abstract string ClassAttributeName { get; }
  protected abstract string OpenNodeComment(IRNode node, EmitContext ctx);
  protected abstract string CloseNodeComment(IRNode node, EmitContext ctx);

  public string Emit(IRNode node, EmitContext ctx)
  {
    var cssProps = StyleTransformer.MergeToProperties(node.Layout, node.Style);
    ctx.Styles.AddBase(node.Id, cssProps);
    ctx.Styles.AddResponsive(node.Id, node.Responsive);

    var sb = new StringBuilder();
    sb.Append(OpenNodeComment(node, ctx));
    sb.Append(EmitElement(node, ctx));
    sb.Append(CloseNodeComment(node, ctx));

    return sb.ToString();
  }

  protected abstract string EmitElement(IRNode node, EmitContext ctx);

  protected string NodeClass(IRNode node) => $" {ClassAttributeName}=\"prismatic-{node.Id}\"";

  protected static string EmitChildren(IRNode node, EmitContext ctx)
  {
    if (node.Children.Count == 0) return string.Empty;

    var sb = new StringBuilder();
    foreach (var child in node.Children)
      sb.Append(ctx.EmitChild(child, ctx.Deeper()));

    return sb.ToString();
  }

  protected static string GetProp(IRNode node, string key, string defaultValue = "") =>
      node.Props.TryGetValue(key, out var val)
          ? val.ValueKind == JsonValueKind.String ? val.GetString() ?? defaultValue : val.ToString()
          : defaultValue;

  protected static bool GetBoolProp(IRNode node, string key, bool defaultValue = false) =>
      node.Props.TryGetValue(key, out var val)
          ? val.ValueKind == JsonValueKind.True
          : defaultValue;

  protected static int GetIntProp(IRNode node, string key, int defaultValue = 0) =>
      node.Props.TryGetValue(key, out var val) && val.TryGetInt32(out var i) ? i : defaultValue;

  protected static string SelfClosing(string tag, string attrs, string indent) =>
      $"{indent}<{tag}{attrs} />\n";

  protected static string Paired(string tag, string attrs, string inner, string indent, bool inlineContent = false)
  {
    if (string.IsNullOrEmpty(inner))
      return $"{indent}<{tag}{attrs}></{tag}>\n";

    if (inlineContent)
      return $"{indent}<{tag}{attrs}>{inner}</{tag}>\n";

    return $"{indent}<{tag}{attrs}>\n{inner}{indent}</{tag}>\n";
  }
}