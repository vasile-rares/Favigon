namespace Prismatic.Application.Registry;

/// <summary>
/// Holds all component mappers for one framework + flavor combination.
/// Each framework (html, react, angular) provides its own implementation.
/// </summary>
public interface IFrameworkRegistry
{
  /// <summary>Target framework identifier: "html" | "react" | "angular".</summary>
  string Framework { get; }

  /// <summary>Optional flavor: "plain" | "tailwind" | "material". Null = default.</summary>
  string? Flavor { get; }

  /// <summary>
  /// Returns the mapper for the given IR component type.
  /// Throws <see cref="InvalidOperationException"/> if no mapper is registered.
  /// </summary>
  IComponentMapper Resolve(string type);

  /// <summary>Returns true if a mapper is registered for the given IR type.</summary>
  bool CanResolve(string type);

  /// <summary>Registers a component mapper. Replaces an existing one for the same type.</summary>
  void Register(IComponentMapper mapper);
}
