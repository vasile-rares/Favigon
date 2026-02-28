using System.Text;
using Prismatic.Domain.IR;
using Prismatic.Application.Pipeline;

namespace Prismatic.Infrastructure.Generators.React;

// ── Navbar ────────────────────────────────────────────────────────────────────

public sealed class ReactNavbarMapper : ReactMapperBase
{
  public override string Type => "Navbar";

  protected override string EmitElement(IRNode node, EmitContext ctx) =>
      Paired("nav", NodeClass(node), EmitChildren(node, ctx), ctx.Indent);
}

// ── Sidebar ───────────────────────────────────────────────────────────────────

public sealed class ReactSidebarMapper : ReactMapperBase
{
  public override string Type => "Sidebar";

  protected override string EmitElement(IRNode node, EmitContext ctx) =>
      Paired("aside", NodeClass(node), EmitChildren(node, ctx), ctx.Indent);
}

// ── Modal ─────────────────────────────────────────────────────────────────────

public sealed class ReactModalMapper : ReactMapperBase
{
  public override string Type => "Modal";

  protected override string EmitElement(IRNode node, EmitContext ctx)
  {
    var open = GetBoolProp(node, "open");
    var label = GetProp(node, "label", "");

    var attrs = NodeClass(node);
    if (open) attrs += " open";
    if (!string.IsNullOrEmpty(label)) attrs += $" aria-label=\"{label}\"";

    return Paired("dialog", attrs, EmitChildren(node, ctx), ctx.Indent);
  }
}

// ── Drawer ────────────────────────────────────────────────────────────────────

public sealed class ReactDrawerMapper : ReactMapperBase
{
  public override string Type => "Drawer";

  protected override string EmitElement(IRNode node, EmitContext ctx)
  {
    var open = GetBoolProp(node, "open");

    var attrs = NodeClass(node);
    attrs += " role=\"dialog\"";
    if (!open) attrs += " aria-hidden=\"true\"";

    return Paired("div", attrs, EmitChildren(node, ctx), ctx.Indent);
  }
}

// ── Tooltip ───────────────────────────────────────────────────────────────────

public sealed class ReactTooltipMapper : ReactMapperBase
{
  public override string Type => "Tooltip";

  protected override string EmitElement(IRNode node, EmitContext ctx)
  {
    var content = GetProp(node, "content", "");
    var attrs = NodeClass(node) + $" title=\"{content}\"";
    return Paired("div", attrs, EmitChildren(node, ctx), ctx.Indent);
  }
}

// ── Tabs ──────────────────────────────────────────────────────────────────────

public sealed class ReactTabsMapper : ReactMapperBase
{
  public override string Type => "Tabs";

  protected override string EmitElement(IRNode node, EmitContext ctx)
  {
    var tabs = GetProp(node, "tabs", "");
    var items = tabs.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);

    var sb = new StringBuilder();
    var inner = ctx.Indent + "  ";

    sb.Append($"{inner}<div role=\"tablist\">\n");
    foreach (var tab in items)
      sb.Append($"{inner}  <button role=\"tab\">{tab}</button>\n");
    sb.Append($"{inner}</div>\n");

    sb.Append(EmitChildren(node, ctx.Deeper()));

    return Paired("div", NodeClass(node), sb.ToString(), ctx.Indent);
  }
}

// ── Accordion ─────────────────────────────────────────────────────────────────

public sealed class ReactAccordionMapper : ReactMapperBase
{
  public override string Type => "Accordion";

  protected override string EmitElement(IRNode node, EmitContext ctx)
  {
    var title = GetProp(node, "title", "");
    var open = GetBoolProp(node, "open");

    var attrs = NodeClass(node);
    if (open) attrs += " open";

    var inner = $"{ctx.Indent}  <summary>{title}</summary>\n{EmitChildren(node, ctx.Deeper())}";
    return Paired("details", attrs, inner, ctx.Indent);
  }
}

// ── Breadcrumb ────────────────────────────────────────────────────────────────

public sealed class ReactBreadcrumbMapper : ReactMapperBase
{
  public override string Type => "Breadcrumb";

  protected override string EmitElement(IRNode node, EmitContext ctx)
  {
    var items = GetProp(node, "items", "");
    var parts = items.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);

    var sb = new StringBuilder();
    var inner = ctx.Indent + "    ";

    foreach (var (part, idx) in parts.Select((p, i) => (p, i)))
    {
      var isCurrent = idx == parts.Length - 1;
      var ariaCurrent = isCurrent ? " aria-current=\"page\"" : string.Empty;
      sb.Append($"{inner}<li><a href=\"#{part.ToLower().Replace(' ', '-')}\"{ariaCurrent}>{part}</a></li>\n");
    }

    var listHtml = $"{ctx.Indent}  <ol style={{{{ display: 'flex', listStyle: 'none', margin: 0, padding: 0 }}}}>\n{sb}{ctx.Indent}  </ol>\n";
    return Paired("nav", " aria-label=\"breadcrumb\"" + NodeClass(node), listHtml, ctx.Indent);
  }
}

// ── Pagination ────────────────────────────────────────────────────────────────

public sealed class ReactPaginationMapper : ReactMapperBase
{
  public override string Type => "Pagination";

  protected override string EmitElement(IRNode node, EmitContext ctx)
  {
    var total = GetIntProp(node, "totalPages", 5);
    var current = GetIntProp(node, "currentPage", 1);

    var sb = new StringBuilder();
    var inner = ctx.Indent + "    ";

    sb.Append($"{inner}<li><button aria-label=\"Previous\">&laquo;</button></li>\n");
    for (var i = 1; i <= total; i++)
    {
      var ariaCurrent = i == current ? " aria-current=\"page\"" : string.Empty;
      sb.Append($"{inner}<li><button{ariaCurrent}>{i}</button></li>\n");
    }
    sb.Append($"{inner}<li><button aria-label=\"Next\">&raquo;</button></li>\n");

    var listHtml = $"{ctx.Indent}  <ul style={{{{ display: 'flex', listStyle: 'none', margin: 0, padding: 0 }}}}>\n{sb}{ctx.Indent}  </ul>\n";
    return Paired("nav", " aria-label=\"pagination\"" + NodeClass(node), listHtml, ctx.Indent);
  }
}
