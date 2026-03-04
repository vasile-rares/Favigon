using Prismatic.Converter.Abstractions;
using Prismatic.Converter.Generators;

namespace Prismatic.Converter.Generators.Angular;

public static class AngularMapperCatalog
{
  public static IComponentMapper[] Create() =>
    MapperCatalog.Combine(Layout(), Typography(), Forms(), Content(), Shell());

  private static IComponentMapper[] Layout() =>
  [
    new AngularStackMapper(), new AngularRowMapper(), new AngularColumnMapper(),
    new AngularGridMapper(), new AngularContainerMapper(), new AngularDividerMapper()
  ];

  private static IComponentMapper[] Typography() =>
  [
    new AngularTextMapper(), new AngularHeadingMapper(), new AngularLinkMapper()
  ];

  private static IComponentMapper[] Forms() =>
  [
    new AngularButtonMapper(), new AngularInputMapper(), new AngularTextareaMapper(),
    new AngularSelectMapper(), new AngularCheckboxMapper(), new AngularRadioMapper(),
    new AngularToggleMapper(), new AngularFormMapper()
  ];

  private static IComponentMapper[] Content() =>
  [
    new AngularCardMapper(), new AngularImageMapper(), new AngularIconMapper(),
    new AngularBadgeMapper(), new AngularAvatarMapper(), new AngularTableMapper(),
    new AngularListMapper()
  ];

  private static IComponentMapper[] Shell() =>
  [
    new AngularNavbarMapper(), new AngularSidebarMapper(), new AngularModalMapper(),
    new AngularDrawerMapper(), new AngularTooltipMapper(), new AngularTabsMapper(),
    new AngularAccordionMapper(), new AngularBreadcrumbMapper(), new AngularPaginationMapper()
  ];
}