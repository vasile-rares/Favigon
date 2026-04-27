using Favigon.Converter.Abstractions;
using Favigon.Converter.Generators;

namespace Favigon.Converter.Generators.Angular;

public static class AngularMapperCatalog
{
  public static IComponentMapper[] Create() =>
    MapperCatalog.Combine(Core());

  private static IComponentMapper[] Core() =>
  [
    new AngularFrameMapper(),
    new AngularContainerMapper(),
    new AngularTextMapper(),
    new AngularImageMapper(),
    new AngularSvgMapper()
  ];
}