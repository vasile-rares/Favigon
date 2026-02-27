using Prismatic.Application.Registry;

namespace Prismatic.Infrastructure.Generators.Html;

/// <summary>
/// Framework registry for plain HTML emission.
/// To add a new component: implement <see cref="HtmlMapperBase"/> and call Register() here.
/// </summary>
public sealed class HtmlRegistry : FrameworkRegistry
{
  public HtmlRegistry() : base("html", flavor: null)
  {
    // Layout
    Register(new HtmlStackMapper());
    Register(new HtmlRowMapper());
    Register(new HtmlColumnMapper());
    Register(new HtmlGridMapper());
    Register(new HtmlContainerMapper());
    Register(new HtmlDividerMapper());

    // Typography
    Register(new HtmlTextMapper());
    Register(new HtmlHeadingMapper());
    Register(new HtmlLinkMapper());

    // Forms
    Register(new HtmlButtonMapper());
    Register(new HtmlInputMapper());
    Register(new HtmlTextareaMapper());
    Register(new HtmlSelectMapper());
    Register(new HtmlCheckboxMapper());
    Register(new HtmlRadioMapper());
    Register(new HtmlToggleMapper());
    Register(new HtmlFormMapper());

    // Content
    Register(new HtmlCardMapper());
    Register(new HtmlImageMapper());
    Register(new HtmlIconMapper());
    Register(new HtmlBadgeMapper());
    Register(new HtmlAvatarMapper());
    Register(new HtmlTableMapper());
    Register(new HtmlListMapper());

    // Shell / Navigation
    Register(new HtmlNavbarMapper());
    Register(new HtmlSidebarMapper());
    Register(new HtmlModalMapper());
    Register(new HtmlDrawerMapper());
    Register(new HtmlTooltipMapper());
    Register(new HtmlTabsMapper());
    Register(new HtmlAccordionMapper());
    Register(new HtmlBreadcrumbMapper());
    Register(new HtmlPaginationMapper());
  }
}
