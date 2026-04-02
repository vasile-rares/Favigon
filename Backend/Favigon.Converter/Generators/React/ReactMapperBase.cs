using Favigon.Converter.Generators;
using Favigon.Converter.Models;
using Favigon.Converter.Utils;

namespace Favigon.Converter.Generators.React;

public abstract class ReactMapperBase : FrameworkMapperBase
{
    protected override string ClassAttributeName => "className";

    protected string BuildLinkAttrs(IRNode node, string href)
    {
        var attrs = NodeClass(node) + $" href=\"{href}\"";
        var target = GetProp(node, "target");

        if (!string.IsNullOrEmpty(target))
        {
            attrs += $" target=\"{target}\"";
            if (target == "_blank")
            {
                attrs += " rel=\"noopener noreferrer\"";
            }
        }

        return AppendAriaLabel(node, attrs);
    }

    protected override string OpenNodeComment(IRNode node, EmitContext ctx) =>
        $"{ctx.Indent}{{/* @favigon-node id=\"{node.Id}\" type=\"{node.Type}\" */}}\n";

    protected override string CloseNodeComment(IRNode node, EmitContext ctx) =>
        $"{ctx.Indent}{{/* @favigon-node-end id=\"{node.Id}\" */}}\n";
}
