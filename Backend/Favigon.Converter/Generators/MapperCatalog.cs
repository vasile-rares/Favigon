using Favigon.Converter.Abstractions;

namespace Favigon.Converter.Generators;

public static class MapperCatalog
{
  public static IComponentMapper[] Combine(params IEnumerable<IComponentMapper>[] groups) =>
    groups.SelectMany(group => group).ToArray();
}