namespace Prismatic.Application.Registry;

/// <summary>
/// Root registry that holds all <see cref="IFrameworkRegistry"/> instances.
/// Resolved by framework + optional flavor. Inject as a singleton.
/// Defined in Application because it depends only on the IFrameworkRegistry interface.
/// </summary>
public class ComponentRegistry
{
  private readonly Dictionary<string, IFrameworkRegistry> _registries = new(StringComparer.OrdinalIgnoreCase);

  /// <summary>Registers a framework registry, replacing any existing entry for the same key.</summary>
  public void RegisterFramework(IFrameworkRegistry registry) =>
      _registries[BuildKey(registry.Framework, registry.Flavor)] = registry;

  /// <summary>
  /// Returns the registry for the requested framework and optional flavor.
  /// Falls back to the plain (no-flavor) registry when the requested flavor is not found.
  /// </summary>
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

  public bool HasFramework(string framework, string? flavor = null) =>
      _registries.ContainsKey(BuildKey(framework, flavor));

  private static string BuildKey(string framework, string? flavor) =>
      flavor is null
          ? framework.ToLowerInvariant()
          : $"{framework.ToLowerInvariant()}:{flavor.ToLowerInvariant()}";
}
