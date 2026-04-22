using Favigon.Converter.Models;
using Favigon.Converter.Transformers;

namespace Favigon.Converter.Utils;

public sealed class EmitContext
{
    public required string Framework { get; init; }
    public int Depth { get; init; }
    public required StyleBuilder Styles { get; init; }
    public required IReadOnlyDictionary<string, NodeCssClasses> CssClassMap { get; init; }
    public required Func<IRNode, EmitContext, string> EmitChild { get; init; }

    public NodeCssClasses GetCssClasses(IRNode node)
    {
        if (CssClassMap.TryGetValue(node.Id, out var classes))
            return classes;

        var fallback = CssClassNameResolver.GetBaseClassName(node);
        return new NodeCssClasses(fallback, fallback);
    }

    public EmitContext Deeper() => new()
    {
        Framework = Framework,
        Depth = Depth + 1,
        Styles = Styles,
        CssClassMap = CssClassMap,
        EmitChild = EmitChild
    };

    public string Indent => new(' ', Depth * 2);
}
