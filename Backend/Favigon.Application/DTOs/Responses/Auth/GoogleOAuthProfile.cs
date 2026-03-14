namespace Favigon.Application.DTOs.Responses;

public sealed class GoogleOAuthProfile
{
  public string ProviderUserId { get; set; } = string.Empty;
  public string Email { get; set; } = string.Empty;
  public string? DisplayName { get; set; }
  public string? ProfilePictureUrl { get; set; }
}