using Prismatic.Domain.IR;
using Prismatic.Application.Pipeline;

namespace Prismatic.Infrastructure.Generators.Angular;

// ── Stack ─────────────────────────────────────────────────────────────────────

public sealed class AngularStackMapper : AngularMapperBase
{
  public override string Type => "Stack";

  protected override string EmitElement(IRNode node, EmitContext ctx)
  {
    node.Layout ??= new IRLayout();
    node.Layout.Mode = "flex";
    node.Layout.Direction = "column";

    return Paired("div", NodeClass(node), EmitChildren(node, ctx), ctx.Indent);
  }
}

// ── Row ───────────────────────────────────────────────────────────────────────

public sealed class AngularRowMapper : AngularMapperBase
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

public sealed class AngularColumnMapper : AngularMapperBase
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

public sealed class AngularGridMapper : AngularMapperBase
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

public sealed class AngularContainerMapper : AngularMapperBase
{
  public override string Type => "Container";

  protected override string EmitElement(IRNode node, EmitContext ctx) =>
      Paired("div", NodeClass(node), EmitChildren(node, ctx), ctx.Indent);
}

// ── Divider ───────────────────────────────────────────────────────────────────

public sealed class AngularDividerMapper : AngularMapperBase
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
