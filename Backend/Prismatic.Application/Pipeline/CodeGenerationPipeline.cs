using Prismatic.Domain.IR;
using Prismatic.Application.Registry;
using Prismatic.Application.Transformers;

namespace Prismatic.Application.Pipeline;

/// <summary>
/// Orchestrates the full IR → code generation flow:
/// validate → resolve registry → recursively emit the node tree.
/// </summary>
public sealed class CodeGenerationPipeline(ComponentRegistry registry)
{
    /// <summary>
    /// Generates code for the given IR tree targeting the specified framework and flavor.
    /// </summary>
    /// <param name="root">Root of the IR node tree.</param>
    /// <param name="framework">Target framework: "html" | "react" | "angular".</param>
    /// <param name="flavor">Optional flavor: "plain" | "tailwind" | "material".</param>
    public CodeGenerationResult Generate(IRNode root, string framework, string? flavor = null)
    {
        // 1 — Validate IR
        var validation = IRValidator.Validate(root);
        if (!validation.IsValid)
            return CodeGenerationResult.Invalid(validation);

        // 2 — Resolve the framework registry
        IFrameworkRegistry frameworkRegistry;
        try
        {
            frameworkRegistry = registry.Resolve(framework, flavor);
        }
        catch (InvalidOperationException ex)
        {
            return CodeGenerationResult.Failure(ex.Message, validation);
        }

        // 3 — Emit the tree recursively
        try
        {
            var styles = new StyleCollector();
            var ctx = new EmitContext
            {
                Framework = framework,
                Flavor = flavor,
                Depth = 0,
                Styles = styles,
                EmitChild = (node, context) => EmitNode(node, context, frameworkRegistry)
            };

            var html = EmitNode(root, ctx, frameworkRegistry);
            var css = styles.Build();
            return CodeGenerationResult.Success(html, css, validation);
        }
        catch (Exception ex)
        {
            return CodeGenerationResult.Failure($"Emission error: {ex.Message}", validation);
        }
    }

    /// <summary>Validates an IR tree without generating code.</summary>
    public IRValidationResult Validate(IRNode root) => IRValidator.Validate(root);

    // ── Internal ──────────────────────────────────────────────────────────────

    private static string EmitNode(IRNode node, EmitContext ctx, IFrameworkRegistry frameworkRegistry)
    {
        if (!frameworkRegistry.CanResolve(node.Type))
            throw new InvalidOperationException(
                $"No mapper registered for component type '{node.Type}' " +
                $"in framework '{frameworkRegistry.Framework}'.");

        var mapper = frameworkRegistry.Resolve(node.Type);
        return mapper.Emit(node, ctx);
    }
}
