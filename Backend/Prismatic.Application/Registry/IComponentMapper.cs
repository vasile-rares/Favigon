using Prismatic.Domain.IR;
using Prismatic.Application.Pipeline;

namespace Prismatic.Application.Registry;

/// <summary>
/// Maps one abstract IR component type to framework-specific markup.
/// One implementation per component per framework (e.g. HtmlButtonMapper, ReactCardMapper).
/// </summary>
public interface IComponentMapper
{
  /// <summary>Abstract IR type this mapper handles (e.g. "Button").</summary>
  string Type { get; }

  /// <summary>
  /// Optional list of variant values this mapper explicitly supports.
  /// Null means the mapper handles all variants of its type.
  /// </summary>
  IReadOnlyList<string>? Variants { get; }

  /// <summary>
  /// Emits framework-specific markup for the given IR node.
  /// Children are emitted via <see cref="EmitContext.EmitChild"/>.
  /// </summary>
  string Emit(IRNode node, EmitContext ctx);
}
