using Prismatic.Converter.Models;
using Prismatic.Converter.Utils;

namespace Prismatic.Converter.Abstractions;

public interface IComponentMapper
{
  string Type { get; }
  string Emit(IRNode node, EmitContext ctx);
}
