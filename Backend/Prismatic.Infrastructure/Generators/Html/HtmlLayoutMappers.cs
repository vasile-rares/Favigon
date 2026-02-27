using System.Text;
using Prismatic.Domain.IR;
using Prismatic.Application.Pipeline;

namespace Prismatic.Infrastructure.Generators.Html;

// ── Stack ─────────────────────────────────────────────────────────────────────

/// <summary>Flex column container.</summary>
public sealed class HtmlStackMapper : HtmlMapperBase
{
    public override string Type => "Stack";

    protected override string EmitElement(IRNode node, EmitContext ctx)
    {
        // Stack forces flex + column; merge with any layout/style the user provided
        node.Layout ??= new IRLayout();
        node.Layout.Mode = "flex";
        node.Layout.Direction = "column";

        return Paired("div", NodeClass(node), EmitChildren(node, ctx), ctx.Indent);
    }
}

// ── Row ───────────────────────────────────────────────────────────────────────

/// <summary>Flex row container.</summary>
public sealed class HtmlRowMapper : HtmlMapperBase
{
    public override string Type => "Row";

    protected override string EmitElement(IRNode node, EmitContext ctx)
    {
        node.Layout ??= new IRLayout();
        node.Layout.Mode = "flex";
        node.Layout.Direction = "row";

        return Paired("div", NodeClass(node), EmitChildren(node, ctx), ctx.Indent);
    }
}

// ── Column ────────────────────────────────────────────────────────────────────

/// <summary>Flex column container (alias for Stack with explicit semantics).</summary>
public sealed class HtmlColumnMapper : HtmlMapperBase
{
    public override string Type => "Column";

    protected override string EmitElement(IRNode node, EmitContext ctx)
    {
        node.Layout ??= new IRLayout();
        node.Layout.Mode = "flex";
        node.Layout.Direction = "column";

        return Paired("div", NodeClass(node), EmitChildren(node, ctx), ctx.Indent);
    }
}

// ── Grid ──────────────────────────────────────────────────────────────────────

/// <summary>CSS Grid container.</summary>
public sealed class HtmlGridMapper : HtmlMapperBase
{
    public override string Type => "Grid";

    protected override string EmitElement(IRNode node, EmitContext ctx)
    {
        node.Layout ??= new IRLayout();
        node.Layout.Mode = "grid";
        node.Layout.Columns ??= 2;

        return Paired("div", NodeClass(node), EmitChildren(node, ctx), ctx.Indent);
    }
}

// ── Container ─────────────────────────────────────────────────────────────────

/// <summary>Generic block container with layout + style applied.</summary>
public sealed class HtmlContainerMapper : HtmlMapperBase
{
    public override string Type => "Container";

    protected override string EmitElement(IRNode node, EmitContext ctx) =>
        Paired("div", NodeClass(node), EmitChildren(node, ctx), ctx.Indent);
}

// ── Divider ───────────────────────────────────────────────────────────────────

/// <summary>Horizontal or vertical rule.</summary>
public sealed class HtmlDividerMapper : HtmlMapperBase
{
    public override string Type => "Divider";

    protected override string EmitElement(IRNode node, EmitContext ctx)
    {
        var orientation = GetProp(node, "orientation", "horizontal");

        return orientation == "vertical"
            ? SelfClosing("div", $"{NodeClass(node)} role=\"separator\" aria-orientation=\"vertical\"", ctx.Indent)
            : SelfClosing("hr", NodeClass(node), ctx.Indent);
    }
}
