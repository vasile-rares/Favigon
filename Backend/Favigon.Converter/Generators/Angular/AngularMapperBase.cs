using Favigon.Converter.Generators;
using Favigon.Converter.Models;
using Favigon.Converter.Utils;

namespace Favigon.Converter.Generators.Angular;

public abstract class AngularMapperBase : FrameworkMapperBase
{
    protected override string ClassAttributeName => "class";

    protected new string BuildLinkAttrs(IRNode node, string href)
    {
        var attrs = NodeClass(node);
        attrs += href.StartsWith('/') || href.StartsWith('#')
            ? $" routerLink=\"{href}\""
            : $" href=\"{href}\"";

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

    protected override string OpenNodeComment(IRNode node, EmitContext ctx) => string.Empty;

    protected override string CloseNodeComment(IRNode node, EmitContext ctx) => string.Empty;
}
