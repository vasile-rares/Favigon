using Prismatic.Converter.Generators;
using Prismatic.Converter.Models;
using Prismatic.Converter.Utils;

namespace Prismatic.Converter.Generators.Angular;

public abstract class AngularMapperBase : FrameworkMapperBase
{
  protected override string ClassAttributeName => "class";

  protected override string OpenNodeComment(IRNode node, EmitContext ctx) =>
      $"{ctx.Indent}<!-- @prismatic-node id=\"{node.Id}\" type=\"{node.Type}\" -->\n";

  protected override string CloseNodeComment(IRNode node, EmitContext ctx) =>
      $"{ctx.Indent}<!-- @prismatic-node-end id=\"{node.Id}\" -->\n";
}
