namespace Prismatic.Application.Registry;

public class ComponentRegistry
{
  private readonly Dictionary<string, IFrameworkRegistry> _registries = new(StringComparer.OrdinalIgnoreCase);

  public void RegisterFramework(IFrameworkRegistry registry) =>
      _registries[BuildKey(registry.Framework, registry.Flavor)] = registry;

  public IFrameworkRegistry Resolve(string framework, string? flavor = null)
  {
    if (flavor is not null && _registries.TryGetValue(BuildKey(framework, flavor), out var exact))
      return exact;

    if (_registries.TryGetValue(BuildKey(framework, null), out var plain))
      return plain;

    throw new InvalidOperationException(
        $"No framework registry registered for '{framework}'" +
        (flavor is not null ? $" (flavor: '{flavor}')" : "") + ". " +
        $"Registered frameworks: {string.Join(", ", _registries.Keys)}");
  }

  private static string BuildKey(string framework, string? flavor) =>
      flavor is null
          ? framework.ToLowerInvariant()
          : $"{framework.ToLowerInvariant()}:{flavor.ToLowerInvariant()}";
}
