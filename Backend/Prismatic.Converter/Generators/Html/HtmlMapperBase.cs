using Prismatic.Converter.Generators;
using Prismatic.Converter.Models;
using Prismatic.Converter.Utils;

namespace Prismatic.Converter.Generators.Html;

public abstract class HtmlMapperBase : FrameworkMapperBase
{
    protected override string ClassAttributeName => "class";

    protected override string OpenNodeComment(IRNode node, EmitContext ctx) =>
        $"{ctx.Indent}<!-- @prismatic-node id=\"{node.Id}\" type=\"{node.Type}\" -->\n";

    protected override string CloseNodeComment(IRNode node, EmitContext ctx) =>
        $"{ctx.Indent}<!-- @prismatic-node-end id=\"{node.Id}\" -->\n";
}

