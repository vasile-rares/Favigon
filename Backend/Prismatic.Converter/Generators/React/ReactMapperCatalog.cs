using Prismatic.Converter.Abstractions;
using Prismatic.Converter.Generators;

namespace Prismatic.Converter.Generators.React;

public static class ReactMapperCatalog
{
  public static IComponentMapper[] Create() =>
    MapperCatalog.Combine(Core());

  private static IComponentMapper[] Core() =>
  [
    new ReactFrameMapper(),
    new ReactContainerMapper(),
    new ReactTextMapper(),
    new ReactImageMapper()
  ];
}