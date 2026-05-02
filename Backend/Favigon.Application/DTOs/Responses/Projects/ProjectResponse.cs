namespace Favigon.Application.DTOs.Responses;

public class ProjectResponse
{
  public int ProjectId { get; set; }
  public int UserId { get; set; }
  public string Name { get; set; } = string.Empty;
  public string Slug { get; set; } = string.Empty;
  public bool IsPublic { get; set; }
  public DateTime CreatedAt { get; set; }
  public DateTime UpdatedAt { get; set; }
  public string? ThumbnailDataUrl { get; set; }
  public int StarCount { get; set; }
  public bool IsStarredByCurrentUser { get; set; }
}
