using Prismatic.Domain.IR;
using Prismatic.Application.Pipeline;

namespace Prismatic.Infrastructure.Generators.React;

// ── Card ──────────────────────────────────────────────────────────────────────

public sealed class ReactCardMapper : ReactMapperBase
{
  public override string Type => "Card";

  protected override string EmitElement(IRNode node, EmitContext ctx) =>
      Paired("div", NodeClass(node), EmitChildren(node, ctx), ctx.Indent);
}

// ── Image ─────────────────────────────────────────────────────────────────────

public sealed class ReactImageMapper : ReactMapperBase
{
  public override string Type => "Image";

  protected override string EmitElement(IRNode node, EmitContext ctx)
  {
    var src = GetProp(node, "src", "");
    var alt = GetProp(node, "alt", "");

    var attrs = NodeClass(node);
    attrs += $" src=\"{src}\" alt=\"{alt}\"";

    return SelfClosing("img", attrs, ctx.Indent);
  }
}

// ── Icon ──────────────────────────────────────────────────────────────────────

public sealed class ReactIconMapper : ReactMapperBase
{
  public override string Type => "Icon";

  protected override string EmitElement(IRNode node, EmitContext ctx)
  {
    var name = GetProp(node, "name", "");
    var label = GetProp(node, "label", name);

    var attrs = NodeClass(node);
    attrs += $" aria-label=\"{label}\" aria-hidden=\"{(string.IsNullOrEmpty(label) ? "true" : "false")}\"";

    return Paired("span", attrs, name, ctx.Indent, inlineContent: true);
  }
}

// ── Badge ─────────────────────────────────────────────────────────────────────

public sealed class ReactBadgeMapper : ReactMapperBase
{
  public override string Type => "Badge";

  protected override string EmitElement(IRNode node, EmitContext ctx)
  {
    var label = GetProp(node, "label", "");
    return Paired("span", NodeClass(node), label, ctx.Indent, inlineContent: true);
  }
}

// ── Avatar ────────────────────────────────────────────────────────────────────

public sealed class ReactAvatarMapper : ReactMapperBase
{
  public override string Type => "Avatar";

  protected override string EmitElement(IRNode node, EmitContext ctx)
  {
    var src = GetProp(node, "src");
    var name = GetProp(node, "name", "");

    if (!string.IsNullOrEmpty(src))
    {
      var attrs = NodeClass(node) + $" src=\"{src}\" alt=\"{name}\"";
      return SelfClosing("img", attrs, ctx.Indent);
    }

    var initials = string.IsNullOrEmpty(name) ? "?" :
        string.Concat(name.Split(' ', StringSplitOptions.RemoveEmptyEntries)
                          .Take(2)
                          .Select(w => char.ToUpper(w[0])));

    return Paired("span", NodeClass(node) + $" role=\"img\" aria-label=\"{name}\"",
        initials, ctx.Indent, inlineContent: true);
  }
}

// ── Table ─────────────────────────────────────────────────────────────────────

public sealed class ReactTableMapper : ReactMapperBase
{
  public override string Type => "Table";

  protected override string EmitElement(IRNode node, EmitContext ctx)
  {
    var columns = GetProp(node, "columns", "");
    var headers = columns.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);

    var inner = ctx.Indent + "  ";
    var thead = string.Empty;

    if (headers.Length > 0)
    {
      var ths = string.Concat(headers.Select(h => $"<th>{h}</th>"));
      thead = $"{inner}<thead><tr>{ths}</tr></thead>\n";
    }

    var tbody = $"{inner}<tbody>\n{EmitChildren(node, ctx.Deeper())}{inner}</tbody>\n";

    return Paired("table", NodeClass(node), thead + tbody, ctx.Indent);
  }
}

// ── List ──────────────────────────────────────────────────────────────────────

public sealed class ReactListMapper : ReactMapperBase
{
  public override string Type => "List";

  protected override string EmitElement(IRNode node, EmitContext ctx)
  {
    var ordered = GetBoolProp(node, "ordered");
    var tag = ordered ? "ol" : "ul";
    return Paired(tag, NodeClass(node), EmitChildren(node, ctx), ctx.Indent);
  }
}
