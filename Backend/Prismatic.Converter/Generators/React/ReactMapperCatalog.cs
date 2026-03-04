using Prismatic.Converter.Abstractions;
using Prismatic.Converter.Generators;

namespace Prismatic.Converter.Generators.React;

public static class ReactMapperCatalog
{
  public static IComponentMapper[] Create() =>
    MapperCatalog.Combine(Layout(), Typography(), Forms(), Content(), Shell());

  private static IComponentMapper[] Layout() =>
  [
    new ReactStackMapper(), new ReactRowMapper(), new ReactColumnMapper(),
    new ReactGridMapper(), new ReactContainerMapper(), new ReactDividerMapper()
  ];

  private static IComponentMapper[] Typography() =>
  [
    new ReactTextMapper(), new ReactHeadingMapper(), new ReactLinkMapper()
  ];

  private static IComponentMapper[] Forms() =>
  [
    new ReactButtonMapper(), new ReactInputMapper(), new ReactTextareaMapper(),
    new ReactSelectMapper(), new ReactCheckboxMapper(), new ReactRadioMapper(),
    new ReactToggleMapper(), new ReactFormMapper()
  ];

  private static IComponentMapper[] Content() =>
  [
    new ReactCardMapper(), new ReactImageMapper(), new ReactIconMapper(),
    new ReactBadgeMapper(), new ReactAvatarMapper(), new ReactTableMapper(),
    new ReactListMapper()
  ];

  private static IComponentMapper[] Shell() =>
  [
    new ReactNavbarMapper(), new ReactSidebarMapper(), new ReactModalMapper(),
    new ReactDrawerMapper(), new ReactTooltipMapper(), new ReactTabsMapper(),
    new ReactAccordionMapper(), new ReactBreadcrumbMapper(), new ReactPaginationMapper()
  ];
}