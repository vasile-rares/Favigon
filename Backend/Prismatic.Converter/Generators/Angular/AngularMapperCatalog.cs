using Prismatic.Converter.Abstractions;
using Prismatic.Converter.Generators;

namespace Prismatic.Converter.Generators.Angular;

public static class AngularMapperCatalog
{
  public static IComponentMapper[] Create() =>
    MapperCatalog.Combine(Core());

  private static IComponentMapper[] Core() =>
  [
    new AngularFrameMapper(),
    new AngularContainerMapper(),
    new AngularTextMapper(),
    new AngularImageMapper()
  ];
}