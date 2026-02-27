using Prismatic.Domain.IR;
using Prismatic.Application.Registry;
using Prismatic.Application.Transformers;

namespace Prismatic.Application.Pipeline;

public sealed class ConverterPipeline(ComponentRegistry registry)
{
    public ConverterResult Generate(IRNode root, string framework, string? flavor = null)
    {
        // 1 — Validate IR
        var validation = IRValidator.Validate(root);
        if (!validation.IsValid)
            return ConverterResult.Invalid(validation);

        // 2 — Resolve the framework registry
        IFrameworkRegistry frameworkRegistry;
        try
        {
            frameworkRegistry = registry.Resolve(framework, flavor);
        }
        catch (InvalidOperationException ex)
        {
            return ConverterResult.Failure(ex.Message, validation);
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
            return ConverterResult.Success(html, css, validation);
        }
        catch (Exception ex)
        {
            return ConverterResult.Failure($"Emission error: {ex.Message}", validation);
        }
    }

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

public sealed class ConverterResult
{
    public bool IsSuccess { get; private init; }
    public string? Html { get; private init; }
    public string? Css { get; private init; }
    public string? ErrorMessage { get; private init; }
    public IRValidationResult ValidationResult { get; private init; } = null!;

    public static ConverterResult Success(string html, string css, IRValidationResult validation) =>
        new() { IsSuccess = true, Html = html, Css = css, ValidationResult = validation };

    public static ConverterResult Invalid(IRValidationResult validation) =>
        new() { IsSuccess = false, ErrorMessage = validation.ToString(), ValidationResult = validation };

    public static ConverterResult Failure(string message, IRValidationResult validation) =>
        new() { IsSuccess = false, ErrorMessage = message, ValidationResult = validation };

    public override string ToString() =>
        IsSuccess ? $"OK (html: {Html?.Length ?? 0} chars, css: {Css?.Length ?? 0} chars)" : $"FAILED: {ErrorMessage}";
}
