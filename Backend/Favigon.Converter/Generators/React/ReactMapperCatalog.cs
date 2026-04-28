using Favigon.Converter.Abstractions;
using Favigon.Converter.Generators;

namespace Favigon.Converter.Generators.React;

public static class ReactMapperCatalog
{
  public static IComponentMapper[] Create() =>
    MapperCatalog.Combine(Core());

  private static IComponentMapper[] Core() =>
  [
    new ReactFrameMapper(),
    new ReactContainerMapper(),
    new ReactTextMapper(),
    new ReactImageMapper(),
    new ReactSvgMapper()
  ];
}