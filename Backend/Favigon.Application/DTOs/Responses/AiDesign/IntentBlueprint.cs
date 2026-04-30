namespace Favigon.Application.DTOs.Responses;

/// <summary>Phase 1 output — describes what the page needs, not how it looks.</summary>
public class IntentBlueprint
{
  /// <summary>Page category: landing, dashboard, auth, blog, portfolio, ecommerce, docs, other.</summary>
  public string PageType { get; set; } = "";

  /// <summary>Visual mood token: professional, playful, minimal, bold, elegant, dark, vibrant.</summary>
  public string ColorMood { get; set; } = "";

  /// <summary>One-sentence description of the product or brand.</summary>
  public string BrandPersonality { get; set; } = "";

  /// <summary>Who the page is designed for.</summary>
  public string TargetAudience { get; set; } = "";

  /// <summary>Text for the primary call-to-action button.</summary>
  public string PrimaryCta { get; set; } = "";

  /// <summary>Ordered list of page sections.</summary>
  public List<IntentSection> Sections { get; set; } = [];
}

public class IntentSection
{
  /// <summary>Section name, e.g. "Navbar", "Hero", "Features", "Pricing", "Footer".</summary>
  public string Name { get; set; } = "";

  /// <summary>One-sentence reason this section exists.</summary>
  public string Purpose { get; set; } = "";

  /// <summary>
  /// Layout pattern: horizontal-bar, full-width-centered, two-column-split,
  /// card-grid-2, card-grid-3, card-grid-4, single-column,
  /// multi-column-footer, dashboard-sidebar, form-centered, testimonial-row.
  /// </summary>
  public string LayoutHint { get; set; } = "";

  /// <summary>1-based position in the page.</summary>
  public int Order { get; set; }
}
