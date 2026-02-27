using Prismatic.Domain.IR;
using Prismatic.Application.Transformers;

namespace Prismatic.Application.Pipeline;

public sealed class EmitContext
{
    public required string Framework { get; init; }
    public string? Flavor { get; init; }
    public int Depth { get; init; }
    public required StyleCollector Styles { get; init; }
    public required Func<IRNode, EmitContext, string> EmitChild { get; init; }

    public EmitContext Deeper() => new()
    {
        Framework = Framework,
        Flavor = Flavor,
        Depth = Depth + 1,
        Styles = Styles,       // shared reference — intentional
        EmitChild = EmitChild
    };

    public string Indent => new(' ', Depth * 2);
}
