using Prismatic.Application.Registry;

namespace Prismatic.Infrastructure.Generators.Angular;

public sealed class AngularRegistry : FrameworkRegistry
{
  public AngularRegistry() : base("angular", flavor: null)
  {
    // Layout
    Register(new AngularStackMapper());
    Register(new AngularRowMapper());
    Register(new AngularColumnMapper());
    Register(new AngularGridMapper());
    Register(new AngularContainerMapper());
    Register(new AngularDividerMapper());

    // Typography
    Register(new AngularTextMapper());
    Register(new AngularHeadingMapper());
    Register(new AngularLinkMapper());

    // Forms
    Register(new AngularButtonMapper());
    Register(new AngularInputMapper());
    Register(new AngularTextareaMapper());
    Register(new AngularSelectMapper());
    Register(new AngularCheckboxMapper());
    Register(new AngularRadioMapper());
    Register(new AngularToggleMapper());
    Register(new AngularFormMapper());

    // Content
    Register(new AngularCardMapper());
    Register(new AngularImageMapper());
    Register(new AngularIconMapper());
    Register(new AngularBadgeMapper());
    Register(new AngularAvatarMapper());
    Register(new AngularTableMapper());
    Register(new AngularListMapper());

    // Shell / Navigation
    Register(new AngularNavbarMapper());
    Register(new AngularSidebarMapper());
    Register(new AngularModalMapper());
    Register(new AngularDrawerMapper());
    Register(new AngularTooltipMapper());
    Register(new AngularTabsMapper());
    Register(new AngularAccordionMapper());
    Register(new AngularBreadcrumbMapper());
    Register(new AngularPaginationMapper());
  }
}
