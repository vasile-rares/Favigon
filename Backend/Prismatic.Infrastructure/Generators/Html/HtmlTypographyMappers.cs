using Prismatic.Domain.IR;
using Prismatic.Application.Pipeline;

namespace Prismatic.Infrastructure.Generators.Html;

// ── Text ──────────────────────────────────────────────────────────────────────

public sealed class HtmlTextMapper : HtmlMapperBase
{
    public override string Type => "Text";

    protected override string EmitElement(IRNode node, EmitContext ctx)
    {
        var content = GetProp(node, "content");
        var inline = GetBoolProp(node, "inline");
        var tag = inline ? "span" : "p";

        return Paired(tag, NodeClass(node), content, ctx.Indent, inlineContent: true);
    }
}

// ── Heading ──────────────────────────────────────────────────────────────────

public sealed class HtmlHeadingMapper : HtmlMapperBase
{
    public override string Type => "Heading";

    protected override string EmitElement(IRNode node, EmitContext ctx)
    {
        var level = GetIntProp(node, "level", 2);
        var content = GetProp(node, "content");
        var tag = $"h{Math.Clamp(level, 1, 6)}";

        return Paired(tag, NodeClass(node), content, ctx.Indent, inlineContent: true);
    }
}

// ── Link ──────────────────────────────────────────────────────────────────────

public sealed class HtmlLinkMapper : HtmlMapperBase
{
    public override string Type => "Link";

    protected override string EmitElement(IRNode node, EmitContext ctx)
    {
        var href = GetProp(node, "href", "#");
        var target = GetProp(node, "target");
        var label = GetProp(node, "label");

        var attrs = NodeClass(node);
        attrs += $" href=\"{href}\"";

        if (!string.IsNullOrEmpty(target))
        {
            attrs += $" target=\"{target}\"";
            if (target == "_blank")
                attrs += " rel=\"noopener noreferrer\"";
        }

        var inner = string.IsNullOrEmpty(label) ? EmitChildren(node, ctx) : label;
        var inline = string.IsNullOrEmpty(label);

        return Paired("a", attrs, inner, ctx.Indent, inlineContent: !inline);
    }
}
