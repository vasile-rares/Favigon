using System.Text;
using System.Text.Json;
using Favigon.Converter.Abstractions;
using Favigon.Converter.Models;
using Favigon.Converter.Transformers;
using Favigon.Converter.Utils;

namespace Favigon.Converter.Generators;

public abstract class FrameworkMapperBase : IComponentMapper
{
  public abstract string Type { get; }

  protected abstract string ClassAttributeName { get; }
  protected abstract string OpenNodeComment(IRNode node, EmitContext ctx);
  protected abstract string CloseNodeComment(IRNode node, EmitContext ctx);

  public string Emit(IRNode node, EmitContext ctx)
  {
    var cssProps = StyleTransformer.MergeToProperties(node.Layout, node.Style, node.Position);
    ctx.Styles.AddBase(node.Id, cssProps);
    ctx.Styles.AddVariants(node.Id, node.Variants);

    var sb = new StringBuilder();
    sb.Append(OpenNodeComment(node, ctx));
    sb.Append(EmitElement(node, ctx));
    sb.Append(CloseNodeComment(node, ctx));

    return sb.ToString();
  }

  protected abstract string EmitElement(IRNode node, EmitContext ctx);

  protected string NodeClass(IRNode node) => $" {ClassAttributeName}=\"favigon-{node.Id}\"";

  protected static string EmitChildren(IRNode node, EmitContext ctx)
  {
    if (node.Children.Count == 0) return string.Empty;

    var sb = new StringBuilder();
    foreach (var child in node.Children)
      sb.Append(ctx.EmitChild(child, ctx.Deeper()));

    return sb.ToString();
  }

  protected static string GetProp(IRNode node, string key, string defaultValue = "")
  {
    if (!node.Props.TryGetValue(key, out var val)) return defaultValue;
    return val switch
    {
      null => defaultValue,
      JsonElement je => je.ValueKind == JsonValueKind.String
        ? je.GetString() ?? defaultValue
        : je.ToString(),
      _ => val.ToString() ?? defaultValue
    };
  }

  protected static bool GetBoolProp(IRNode node, string key, bool defaultValue = false)
  {
    if (!node.Props.TryGetValue(key, out var val)) return defaultValue;
    return val switch
    {
      null => defaultValue,
      JsonElement je => je.ValueKind == JsonValueKind.True,
      bool b => b,
      _ => bool.TryParse(val?.ToString(), out var parsed) ? parsed : defaultValue
    };
  }

  protected static int GetIntProp(IRNode node, string key, int defaultValue = 0)
  {
    if (!node.Props.TryGetValue(key, out var val)) return defaultValue;
    return val switch
    {
      null => defaultValue,
      JsonElement je => je.TryGetInt32(out var i) ? i : defaultValue,
      int i => i,
      _ => int.TryParse(val?.ToString(), out var parsed) ? parsed : defaultValue
    };
  }

  protected static string AppendAriaLabel(IRNode node, string attrs)
  {
    var ariaLabel = GetProp(node, "ariaLabel");
    return string.IsNullOrWhiteSpace(ariaLabel)
      ? attrs
      : $"{attrs} aria-label=\"{ariaLabel}\"";
  }

  protected static string ResolveTag(IRNode node, string defaultTag, params string[] allowedTags)
  {
    var requestedTag = GetProp(node, "tag");
    if (string.IsNullOrWhiteSpace(requestedTag))
    {
      return defaultTag;
    }

    foreach (var allowedTag in allowedTags)
    {
      if (string.Equals(allowedTag, requestedTag, StringComparison.OrdinalIgnoreCase))
      {
        return allowedTag;
      }
    }

    return defaultTag;
  }

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
