using Favigon.Converter.Models;
using Favigon.Converter.Utils;

namespace Favigon.Converter.Abstractions;

public interface IComponentMapper
{
  string Type { get; }
  string Emit(IRNode node, EmitContext ctx);
}
