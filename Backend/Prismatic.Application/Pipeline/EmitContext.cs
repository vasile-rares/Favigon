using Prismatic.Domain.IR;
using Prismatic.Application.Transformers;

namespace Prismatic.Application.Pipeline;

/// <summary>
/// Immutable context passed through the pipeline and into every component mapper.
/// </summary>
public sealed class EmitContext
{
    /// <summary>Target framework: "html" | "react" | "angular".</summary>
    public required string Framework { get; init; }

    /// <summary>Optional flavor: "plain" | "tailwind" | "material". Null = default.</summary>
    public string? Flavor { get; init; }

    /// <summary>Current nesting depth, used for indentation by emitters.</summary>
    public int Depth { get; init; }

    /// <summary>
    /// Shared CSS collector — reference type, all EmitContext copies share the same instance.
    /// Mappers deposit their styles here; the pipeline extracts CSS at the end.
    /// </summary>
    public required StyleCollector Styles { get; init; }

    /// <summary>
    /// Delegate that emits a child IR node within the current context.
    /// Mappers call this to recursively render their children.
    /// </summary>
    public required Func<IRNode, EmitContext, string> EmitChild { get; init; }

    /// <summary>Returns a new context with Depth incremented by one.</summary>
    public EmitContext Deeper() => new()
    {
        Framework = Framework,
        Flavor = Flavor,
        Depth = Depth + 1,
        Styles = Styles,       // shared reference — intentional
        EmitChild = EmitChild
    };

    /// <summary>Indentation string for the current depth (2-space indent).</summary>
    public string Indent => new(' ', Depth * 2);
}
