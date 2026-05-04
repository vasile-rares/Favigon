namespace Favigon.Application.DTOs.Responses.Explore;

public class ExploreProjectDto
{
  public int ProjectId { get; set; }
  public string Name { get; set; } = string.Empty;
  public string Slug { get; set; } = string.Empty;
  public string? ThumbnailDataUrl { get; set; }
  public int StarCount { get; set; }
  public int ViewCount { get; set; }
  public bool IsStarredByCurrentUser { get; set; }
  public DateTime UpdatedAt { get; set; }
  public int OwnerUserId { get; set; }
  public string OwnerUsername { get; set; } = string.Empty;
  public string OwnerDisplayName { get; set; } = string.Empty;
  public string? OwnerProfilePictureUrl { get; set; }
}
