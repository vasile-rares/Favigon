using Prismatic.Converter.Abstractions;
using Prismatic.Converter.Generators;

namespace Prismatic.Converter.Generators.Html;

public static class HtmlMapperCatalog
{
  public static IComponentMapper[] Create() =>
    MapperCatalog.Combine(Layout(), Typography(), Forms(), Content(), Shell());

  private static IComponentMapper[] Layout() =>
  [
    new HtmlStackMapper(), new HtmlRowMapper(), new HtmlColumnMapper(),
    new HtmlGridMapper(), new HtmlContainerMapper(), new HtmlDividerMapper()
  ];

  private static IComponentMapper[] Typography() =>
  [
    new HtmlTextMapper(), new HtmlHeadingMapper(), new HtmlLinkMapper()
  ];

  private static IComponentMapper[] Forms() =>
  [
    new HtmlButtonMapper(), new HtmlInputMapper(), new HtmlTextareaMapper(),
    new HtmlSelectMapper(), new HtmlCheckboxMapper(), new HtmlRadioMapper(),
    new HtmlToggleMapper(), new HtmlFormMapper()
  ];

  private static IComponentMapper[] Content() =>
  [
    new HtmlCardMapper(), new HtmlImageMapper(), new HtmlIconMapper(),
    new HtmlBadgeMapper(), new HtmlAvatarMapper(), new HtmlTableMapper(),
    new HtmlListMapper()
  ];

  private static IComponentMapper[] Shell() =>
  [
    new HtmlNavbarMapper(), new HtmlSidebarMapper(), new HtmlModalMapper(),
    new HtmlDrawerMapper(), new HtmlTooltipMapper(), new HtmlTabsMapper(),
    new HtmlAccordionMapper(), new HtmlBreadcrumbMapper(), new HtmlPaginationMapper()
  ];
}