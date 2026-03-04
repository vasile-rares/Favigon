using Prismatic.Application.Interfaces;
using Prismatic.Application.DTOs.Responses;
using Prismatic.Application.Pipeline;
using Prismatic.Application.Registry;
using Prismatic.Application.Transformers;
using Prismatic.Domain.IR;

namespace Prismatic.Application.Services;

public class ConverterService(ComponentRegistry registry) : IConverterService
{
  public ConverterResponse Generate(IRNode root, string framework, string? flavor = null)
  {
    var validation = IRValidator.Validate(root);
    if (!validation.IsValid)
      throw new InvalidOperationException("IR validation failed.");

    IFrameworkRegistry frameworkRegistry;
    try
    {
      frameworkRegistry = registry.Resolve(framework, flavor);
    }
    catch (InvalidOperationException ex)
    {
      throw new ArgumentException(ex.Message);
    }

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
      return new ConverterResponse
      {
        Framework = framework,
        Flavor = flavor,
        IsSuccess = true,
        IsValid = true,
        Html = html,
        Css = css
      };
    }
    catch (Exception ex)
    {
      throw new ArgumentException($"Emission error: {ex.Message}");
    }
  }

  public IRValidationResult Validate(IRNode root)
  {
    var validation = IRValidator.Validate(root);
    if (!validation.IsValid)
      throw new InvalidOperationException("IR validation failed.");

    return validation;
  }

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
