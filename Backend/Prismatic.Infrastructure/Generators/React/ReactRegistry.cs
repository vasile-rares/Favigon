using Prismatic.Application.Registry;

namespace Prismatic.Infrastructure.Generators.React;

public sealed class ReactRegistry : FrameworkRegistry
{
  public ReactRegistry() : base("react", flavor: null)
  {
    // Layout
    Register(new ReactStackMapper());
    Register(new ReactRowMapper());
    Register(new ReactColumnMapper());
    Register(new ReactGridMapper());
    Register(new ReactContainerMapper());
    Register(new ReactDividerMapper());

    // Typography
    Register(new ReactTextMapper());
    Register(new ReactHeadingMapper());
    Register(new ReactLinkMapper());

    // Forms
    Register(new ReactButtonMapper());
    Register(new ReactInputMapper());
    Register(new ReactTextareaMapper());
    Register(new ReactSelectMapper());
    Register(new ReactCheckboxMapper());
    Register(new ReactRadioMapper());
    Register(new ReactToggleMapper());
    Register(new ReactFormMapper());

    // Content
    Register(new ReactCardMapper());
    Register(new ReactImageMapper());
    Register(new ReactIconMapper());
    Register(new ReactBadgeMapper());
    Register(new ReactAvatarMapper());
    Register(new ReactTableMapper());
    Register(new ReactListMapper());

    // Shell / Navigation
    Register(new ReactNavbarMapper());
    Register(new ReactSidebarMapper());
    Register(new ReactModalMapper());
    Register(new ReactDrawerMapper());
    Register(new ReactTooltipMapper());
    Register(new ReactTabsMapper());
    Register(new ReactAccordionMapper());
    Register(new ReactBreadcrumbMapper());
    Register(new ReactPaginationMapper());
  }
}
