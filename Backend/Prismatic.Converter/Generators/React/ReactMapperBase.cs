using Prismatic.Converter.Generators;
using Prismatic.Converter.Models;
using Prismatic.Converter.Utils;

namespace Prismatic.Converter.Generators.React;

public abstract class ReactMapperBase : FrameworkMapperBase
{
  protected override string ClassAttributeName => "className";

  protected override string OpenNodeComment(IRNode node, EmitContext ctx) =>
      $"{ctx.Indent}{{/* @prismatic-node id=\"{node.Id}\" type=\"{node.Type}\" */}}\n";

  protected override string CloseNodeComment(IRNode node, EmitContext ctx) =>
      $"{ctx.Indent}{{/* @prismatic-node-end id=\"{node.Id}\" */}}\n";
}
