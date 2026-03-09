namespace Prismatic.Application.DTOs.Responses;

public sealed class GithubOAuthProfile
{
  public string ProviderUserId { get; set; } = string.Empty;
  public string Email { get; set; } = string.Empty;
  public string? Username { get; set; }
  public string? DisplayName { get; set; }
  public string? ProfilePictureUrl { get; set; }
}