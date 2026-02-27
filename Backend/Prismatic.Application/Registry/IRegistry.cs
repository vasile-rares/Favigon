using Prismatic.Domain.IR;
using Prismatic.Application.Pipeline;

namespace Prismatic.Application.Registry;

public interface IComponentMapper
{
    string Type { get; }
    string Emit(IRNode node, EmitContext ctx);
}

public interface IFrameworkRegistry
{
    string Framework { get; }
    string? Flavor { get; }
    IComponentMapper Resolve(string type);
    bool CanResolve(string type);
}
