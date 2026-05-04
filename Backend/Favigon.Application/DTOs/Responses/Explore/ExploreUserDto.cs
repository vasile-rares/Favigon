namespace Favigon.Application.DTOs.Responses.Explore;

public class ExploreUserDto
{
  public int UserId { get; set; }
  public string Username { get; set; } = string.Empty;
  public string DisplayName { get; set; } = string.Empty;
  public string? ProfilePictureUrl { get; set; }
  public int FollowerCount { get; set; }
  public int PublicProjectCount { get; set; }
  public bool IsFollowedByCurrentUser { get; set; }
}
