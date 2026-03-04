using Prismatic.Converter.Models;
using Prismatic.Converter.Transformers;

namespace Prismatic.Converter.Utils;

public sealed class EmitContext
{
    public required string Framework { get; init; }
    public int Depth { get; init; }
    public required StyleCollector Styles { get; init; }
    public required Func<IRNode, EmitContext, string> EmitChild { get; init; }

    public EmitContext Deeper() => new()
    {
        Framework = Framework,
        Depth = Depth + 1,
        Styles = Styles,
        EmitChild = EmitChild
    };

    public string Indent => new(' ', Depth * 2);
}
