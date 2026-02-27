using System.Text;
using Prismatic.Domain.IR;
using Prismatic.Application.Pipeline;

namespace Prismatic.Infrastructure.Generators.Html;

// ── Button ────────────────────────────────────────────────────────────────────

public sealed class HtmlButtonMapper : HtmlMapperBase
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

// ── Input ─────────────────────────────────────────────────────────────────────

public sealed class HtmlInputMapper : HtmlMapperBase
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
        if (!string.IsNullOrEmpty(value)) attrs += $" value=\"{value}\"";
        if (!string.IsNullOrEmpty(name)) attrs += $" name=\"{name}\"";
        if (required) attrs += " required";
        if (disabled) attrs += " disabled";

        return SelfClosing("input", attrs, ctx.Indent);
    }
}

// ── Textarea ──────────────────────────────────────────────────────────────────

public sealed class HtmlTextareaMapper : HtmlMapperBase
{
    public override string Type => "Textarea";

    protected override string EmitElement(IRNode node, EmitContext ctx)
    {
        var placeholder = GetProp(node, "placeholder");
        var rows = GetIntProp(node, "rows", 4);
        var disabled = GetBoolProp(node, "disabled");
        var value = GetProp(node, "value");

        var attrs = NodeClass(node);
        attrs += $" rows=\"{rows}\"";
        if (!string.IsNullOrEmpty(placeholder)) attrs += $" placeholder=\"{placeholder}\"";
        if (disabled) attrs += " disabled";

        return Paired("textarea", attrs, value, ctx.Indent, inlineContent: true);
    }
}

// ── Select ────────────────────────────────────────────────────────────────────

public sealed class HtmlSelectMapper : HtmlMapperBase
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

        // Children are expected to be <option>-like IR nodes, or fall back to empty
        var inner = EmitChildren(node, ctx);
        return Paired("select", attrs, inner, ctx.Indent);
    }
}

// ── Checkbox ──────────────────────────────────────────────────────────────────

public sealed class HtmlCheckboxMapper : HtmlMapperBase
{
    public override string Type => "Checkbox";

    protected override string EmitElement(IRNode node, EmitContext ctx)
    {
        var label = GetProp(node, "label");
        var name = GetProp(node, "name");
        var @checked = GetBoolProp(node, "checked");
        var disabled = GetBoolProp(node, "disabled");

        var inputAttrs = $" type=\"checkbox\"";
        if (!string.IsNullOrEmpty(name)) inputAttrs += $" name=\"{name}\"";
        if (@checked) inputAttrs += " checked";
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

// ── Radio ─────────────────────────────────────────────────────────────────────

public sealed class HtmlRadioMapper : HtmlMapperBase
{
    public override string Type => "Radio";

    protected override string EmitElement(IRNode node, EmitContext ctx)
    {
        var label = GetProp(node, "label");
        var name = GetProp(node, "name");
        var value = GetProp(node, "value");
        var @checked = GetBoolProp(node, "checked");
        var disabled = GetBoolProp(node, "disabled");

        var inputAttrs = $" type=\"radio\"";
        if (!string.IsNullOrEmpty(name)) inputAttrs += $" name=\"{name}\"";
        if (!string.IsNullOrEmpty(value)) inputAttrs += $" value=\"{value}\"";
        if (@checked) inputAttrs += " checked";
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

// ── Toggle ────────────────────────────────────────────────────────────────────

public sealed class HtmlToggleMapper : HtmlMapperBase
{
    public override string Type => "Toggle";

    protected override string EmitElement(IRNode node, EmitContext ctx)
    {
        var label = GetProp(node, "label");
        var @checked = GetBoolProp(node, "checked");
        var disabled = GetBoolProp(node, "disabled");

        var inputAttrs = " type=\"checkbox\" role=\"switch\"";
        if (@checked) inputAttrs += " checked";
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

// ── Form ──────────────────────────────────────────────────────────────────────

public sealed class HtmlFormMapper : HtmlMapperBase
{
    public override string Type => "Form";

    protected override string EmitElement(IRNode node, EmitContext ctx)
    {
        var action = GetProp(node, "action");
        var method = GetProp(node, "method", "post");

        var attrs = NodeClass(node);
        attrs += $" method=\"{method}\"";
        if (!string.IsNullOrEmpty(action)) attrs += $" action=\"{action}\"";

        return Paired("form", attrs, EmitChildren(node, ctx), ctx.Indent);
    }
}
