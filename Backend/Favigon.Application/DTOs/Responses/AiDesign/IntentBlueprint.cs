namespace Favigon.Application.DTOs.Responses;

public class IntentBlueprint
{
  public string PageType { get; set; } = "";
  public string ColorMood { get; set; } = "";

  public string BrandPersonality { get; set; } = "";
  public string TargetAudience { get; set; } = "";
  public string PrimaryCta { get; set; } = "";
  public List<IntentSection> Sections { get; set; } = [];
}

public class IntentSection
{
  public string Name { get; set; } = "";
  public string Purpose { get; set; } = "";

  public string LayoutHint { get; set; } = "";

  public int Order { get; set; }
}
