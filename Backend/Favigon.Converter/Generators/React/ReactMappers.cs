using Favigon.Converter.Models;
using Favigon.Converter.Utils;

namespace Favigon.Converter.Generators.React;

public sealed class ReactTextMapper : ReactMapperBase
{
  public override string Type => "Text";

  protected override string EmitElement(IRNode node, EmitContext ctx)
  {
    var content = GetProp(node, "content");
    var href = GetProp(node, "href");
    var inline = GetBoolProp(node, "inline");
    var tag = ResolveTag(node, inline ? "span" : "p", "div", "p", "span", "label");

    if (!string.IsNullOrWhiteSpace(href))
    {
      return Paired("a", BuildLinkAttrs(node, href), content, ctx.Indent, inlineContent: true);
    }

    return Paired(tag, AppendAriaLabel(node, NodeClass(node)), content, ctx.Indent, inlineContent: true);
  }
}

public sealed class ReactImageMapper : ReactMapperBase
{
  public override string Type => "Image";

  protected override string EmitElement(IRNode node, EmitContext ctx)
  {
    var src = GetProp(node, "src", "");
    var alt = GetProp(node, "alt", "");
    var href = GetProp(node, "href");

    if (!string.IsNullOrWhiteSpace(href))
    {
      var inner = SelfClosing("img", $" src=\"{src}\" alt=\"{alt}\"", ctx.Deeper().Indent);
      return Paired("a", BuildLinkAttrs(node, href), inner, ctx.Indent);
    }

    var attrs = NodeClass(node);
    attrs += $" src=\"{src}\" alt=\"{alt}\"";

    return SelfClosing("img", attrs, ctx.Indent);
  }
}

public sealed class ReactContainerMapper : ReactMapperBase
{
  public override string Type => "Container";

  protected override string EmitElement(IRNode node, EmitContext ctx)
  {
    var href = GetProp(node, "href");
    var tag = ResolveTag(
      node,
      "div",
      "div",
      "section",
      "article",
      "aside",
      "main",
      "header",
      "footer",
      "nav"
    );

    if (!string.IsNullOrWhiteSpace(href))
      return Paired("a", BuildLinkAttrs(node, href), EmitChildren(node, ctx), ctx.Indent);

    var attrs = AppendAriaLabel(node, NodeClass(node));
    attrs += FocusAttr(node);
    return Paired(tag, attrs, EmitChildren(node, ctx), ctx.Indent);
  }
}

public sealed class ReactFrameMapper : ReactMapperBase
{
  public override string Type => "Frame";

  protected override string EmitElement(IRNode node, EmitContext ctx)
  {
    var href = GetProp(node, "href");
    var tag = ResolveTag(
      node,
      "div",
      "div",
      "section",
      "article",
      "aside",
      "main",
      "header",
      "footer",
      "nav"
    );

    if (!string.IsNullOrWhiteSpace(href))
      return Paired("a", BuildLinkAttrs(node, href), EmitChildren(node, ctx), ctx.Indent);

    var attrs = AppendAriaLabel(node, NodeClass(node));
    attrs += FocusAttr(node);
    return Paired(tag, attrs, EmitChildren(node, ctx), ctx.Indent);
  }
}