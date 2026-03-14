using Favigon.Converter.Abstractions;
using Favigon.Converter.Generators;

namespace Favigon.Converter.Generators.Html;

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