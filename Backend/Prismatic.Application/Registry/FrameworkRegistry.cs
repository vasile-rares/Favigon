namespace Prismatic.Application.Registry;

/// <summary>
/// Base implementation of <see cref="IFrameworkRegistry"/>.
/// Framework-specific registries (HtmlRegistry, ReactRegistry, etc.) subclass this
/// and register their mappers in the constructor.
/// </summary>
public class FrameworkRegistry(string framework, string? flavor = null) : IFrameworkRegistry
{
  private readonly Dictionary<string, IComponentMapper> _mappers = new(StringComparer.OrdinalIgnoreCase);

  public string Framework { get; } = framework;
  public string? Flavor { get; } = flavor;

  public void Register(IComponentMapper mapper) => _mappers[mapper.Type] = mapper;

  public bool CanResolve(string type) => _mappers.ContainsKey(type);

  public IComponentMapper Resolve(string type)
  {
    if (_mappers.TryGetValue(type, out var mapper))
      return mapper;

    throw new InvalidOperationException(
        $"No component mapper registered for type '{type}' in framework '{Framework}'" +
        (Flavor is not null ? $" (flavor: '{Flavor}')" : "") + ".");
  }
}
