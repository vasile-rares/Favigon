using Prismatic.Converter.Abstractions;
using Prismatic.Converter.Generators;

namespace Prismatic.Converter.Generators.Html;

public static class HtmlMapperCatalog
{
  public static IComponentMapper[] Create() =>
    MapperCatalog.Combine(Core());

  private static IComponentMapper[] Core() =>
  [
    new HtmlFrameMapper(),
    new HtmlContainerMapper(),
    new HtmlTextMapper(),
    new HtmlImageMapper()
  ];
}