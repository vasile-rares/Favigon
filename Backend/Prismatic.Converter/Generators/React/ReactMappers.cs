using System.Text;
using Prismatic.Converter.Models;
using Prismatic.Converter.Utils;

namespace Prismatic.Converter.Generators.React;

public sealed class ReactTextMapper : ReactMapperBase
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

public sealed class ReactHeadingMapper : ReactMapperBase
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

public sealed class ReactLinkMapper : ReactMapperBase
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

public sealed class ReactCardMapper : ReactMapperBase
{
  public override string Type => "Card";

  protected override string EmitElement(IRNode node, EmitContext ctx) =>
      Paired("div", NodeClass(node), EmitChildren(node, ctx), ctx.Indent);
}

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

public sealed class ReactBadgeMapper : ReactMapperBase
{
  public override string Type => "Badge";

  protected override string EmitElement(IRNode node, EmitContext ctx)
  {
    var label = GetProp(node, "label", "");
    return Paired("span", NodeClass(node), label, ctx.Indent, inlineContent: true);
  }
}

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

public sealed class ReactButtonMapper : ReactMapperBase
{
  public override string Type => "Button";

  protected override string EmitElement(IRNode node, EmitContext ctx)
  {
    var label = GetProp(node, "label", "Button");
    var type = GetProp(node, "buttonType", "button");
    var disabled = GetBoolProp(node, "disabled");

    var attrs = NodeClass(node);
    attrs += $" type=\"{type}\"";
    if (disabled) attrs += " disabled";

    return Paired("button", attrs, label, ctx.Indent, inlineContent: true);
  }
}

public sealed class ReactInputMapper : ReactMapperBase
{
  public override string Type => "Input";

  protected override string EmitElement(IRNode node, EmitContext ctx)
  {
    var inputType = GetProp(node, "inputType", "text");
    var placeholder = GetProp(node, "placeholder");
    var value = GetProp(node, "value");
    var disabled = GetBoolProp(node, "disabled");
    var required = GetBoolProp(node, "required");
    var name = GetProp(node, "name");

    var attrs = NodeClass(node);
    attrs += $" type=\"{inputType}\"";
    if (!string.IsNullOrEmpty(placeholder)) attrs += $" placeholder=\"{placeholder}\"";
    if (!string.IsNullOrEmpty(value)) attrs += $" defaultValue=\"{value}\"";
    if (!string.IsNullOrEmpty(name)) attrs += $" name=\"{name}\"";
    if (required) attrs += " required";
    if (disabled) attrs += " disabled";

    return SelfClosing("input", attrs, ctx.Indent);
  }
}

public sealed class ReactTextareaMapper : ReactMapperBase
{
  public override string Type => "Textarea";

  protected override string EmitElement(IRNode node, EmitContext ctx)
  {
    var placeholder = GetProp(node, "placeholder");
    var rows = GetIntProp(node, "rows", 4);
    var disabled = GetBoolProp(node, "disabled");
    var value = GetProp(node, "value");

    var attrs = NodeClass(node);
    attrs += $" rows={{{rows}}}";
    if (!string.IsNullOrEmpty(placeholder)) attrs += $" placeholder=\"{placeholder}\"";
    if (!string.IsNullOrEmpty(value)) attrs += $" defaultValue=\"{value}\"";
    if (disabled) attrs += " disabled";

    return Paired("textarea", attrs, string.Empty, ctx.Indent);
  }
}

public sealed class ReactSelectMapper : ReactMapperBase
{
  public override string Type => "Select";

  protected override string EmitElement(IRNode node, EmitContext ctx)
  {
    var disabled = GetBoolProp(node, "disabled");
    var multiple = GetBoolProp(node, "multiple");
    var name = GetProp(node, "name");

    var attrs = NodeClass(node);
    if (!string.IsNullOrEmpty(name)) attrs += $" name=\"{name}\"";
    if (multiple) attrs += " multiple";
    if (disabled) attrs += " disabled";

    return Paired("select", attrs, EmitChildren(node, ctx), ctx.Indent);
  }
}

public sealed class ReactCheckboxMapper : ReactMapperBase
{
  public override string Type => "Checkbox";

  protected override string EmitElement(IRNode node, EmitContext ctx)
  {
    var label = GetProp(node, "label");
    var name = GetProp(node, "name");
    var @checked = GetBoolProp(node, "checked");
    var disabled = GetBoolProp(node, "disabled");

    var inputAttrs = " type=\"checkbox\"";
    if (!string.IsNullOrEmpty(name)) inputAttrs += $" name=\"{name}\"";
    if (@checked) inputAttrs += " defaultChecked";
    if (disabled) inputAttrs += " disabled";

    var sb = new StringBuilder();
    sb.Append($"{ctx.Indent}<label{NodeClass(node)}>\n");
    sb.Append($"{ctx.Indent}  <input{inputAttrs} />\n");
    if (!string.IsNullOrEmpty(label))
      sb.Append($"{ctx.Indent}  <span>{label}</span>\n");
    sb.Append($"{ctx.Indent}</label>\n");
    return sb.ToString();
  }
}

public sealed class ReactRadioMapper : ReactMapperBase
{
  public override string Type => "Radio";

  protected override string EmitElement(IRNode node, EmitContext ctx)
  {
    var label = GetProp(node, "label");
    var name = GetProp(node, "name");
    var value = GetProp(node, "value");
    var @checked = GetBoolProp(node, "checked");
    var disabled = GetBoolProp(node, "disabled");

    var inputAttrs = " type=\"radio\"";
    if (!string.IsNullOrEmpty(name)) inputAttrs += $" name=\"{name}\"";
    if (!string.IsNullOrEmpty(value)) inputAttrs += $" value=\"{value}\"";
    if (@checked) inputAttrs += " defaultChecked";
    if (disabled) inputAttrs += " disabled";

    var sb = new StringBuilder();
    sb.Append($"{ctx.Indent}<label{NodeClass(node)}>\n");
    sb.Append($"{ctx.Indent}  <input{inputAttrs} />\n");
    if (!string.IsNullOrEmpty(label))
      sb.Append($"{ctx.Indent}  <span>{label}</span>\n");
    sb.Append($"{ctx.Indent}</label>\n");
    return sb.ToString();
  }
}

public sealed class ReactToggleMapper : ReactMapperBase
{
  public override string Type => "Toggle";

  protected override string EmitElement(IRNode node, EmitContext ctx)
  {
    var label = GetProp(node, "label");
    var @checked = GetBoolProp(node, "checked");
    var disabled = GetBoolProp(node, "disabled");

    var inputAttrs = " type=\"checkbox\" role=\"switch\"";
    if (@checked) inputAttrs += " defaultChecked";
    if (disabled) inputAttrs += " disabled";

    var sb = new StringBuilder();
    sb.Append($"{ctx.Indent}<label{NodeClass(node)}>\n");
    sb.Append($"{ctx.Indent}  <input{inputAttrs} />\n");
    if (!string.IsNullOrEmpty(label))
      sb.Append($"{ctx.Indent}  <span>{label}</span>\n");
    sb.Append($"{ctx.Indent}</label>\n");
    return sb.ToString();
  }
}

public sealed class ReactFormMapper : ReactMapperBase
{
  public override string Type => "Form";

  protected override string EmitElement(IRNode node, EmitContext ctx)
  {
    var method = GetProp(node, "method", "post");
    var action = GetProp(node, "action");

    var attrs = NodeClass(node);
    attrs += $" method=\"{method}\"";
    if (!string.IsNullOrEmpty(action)) attrs += $" action=\"{action}\"";

    return Paired("form", attrs, EmitChildren(node, ctx), ctx.Indent);
  }
}

public sealed class ReactStackMapper : ReactMapperBase
{
  public override string Type => "Stack";

  protected override string EmitElement(IRNode node, EmitContext ctx)
  {
    node.Layout ??= new IRLayout();
    node.Layout.Mode = LayoutMode.Flex;
    node.Layout.Direction = FlexDirection.Column;

    return Paired("div", NodeClass(node), EmitChildren(node, ctx), ctx.Indent);
  }
}

public sealed class ReactRowMapper : ReactMapperBase
{
  public override string Type => "Row";

  protected override string EmitElement(IRNode node, EmitContext ctx)
  {
    node.Layout ??= new IRLayout();
    node.Layout.Mode = LayoutMode.Flex;
    node.Layout.Direction = FlexDirection.Row;

    return Paired("div", NodeClass(node), EmitChildren(node, ctx), ctx.Indent);
  }
}

public sealed class ReactColumnMapper : ReactMapperBase
{
  public override string Type => "Column";

  protected override string EmitElement(IRNode node, EmitContext ctx)
  {
    node.Layout ??= new IRLayout();
    node.Layout.Mode = LayoutMode.Flex;
    node.Layout.Direction = FlexDirection.Column;

    return Paired("div", NodeClass(node), EmitChildren(node, ctx), ctx.Indent);
  }
}

public sealed class ReactGridMapper : ReactMapperBase
{
  public override string Type => "Grid";

  protected override string EmitElement(IRNode node, EmitContext ctx)
  {
    node.Layout ??= new IRLayout();
    node.Layout.Mode = LayoutMode.Grid;
    node.Layout.Columns ??= 2;

    return Paired("div", NodeClass(node), EmitChildren(node, ctx), ctx.Indent);
  }
}

public sealed class ReactContainerMapper : ReactMapperBase
{
  public override string Type => "Container";

  protected override string EmitElement(IRNode node, EmitContext ctx) =>
      Paired("div", NodeClass(node), EmitChildren(node, ctx), ctx.Indent);
}

public sealed class ReactFrameMapper : ReactMapperBase
{
  public override string Type => "Frame";

  protected override string EmitElement(IRNode node, EmitContext ctx) =>
      Paired("div", NodeClass(node), EmitChildren(node, ctx), ctx.Indent);
}

public sealed class ReactDividerMapper : ReactMapperBase
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

public sealed class ReactNavbarMapper : ReactMapperBase
{
  public override string Type => "Navbar";

  protected override string EmitElement(IRNode node, EmitContext ctx) =>
      Paired("nav", NodeClass(node), EmitChildren(node, ctx), ctx.Indent);
}

public sealed class ReactSidebarMapper : ReactMapperBase
{
  public override string Type => "Sidebar";

  protected override string EmitElement(IRNode node, EmitContext ctx) =>
      Paired("aside", NodeClass(node), EmitChildren(node, ctx), ctx.Indent);
}

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