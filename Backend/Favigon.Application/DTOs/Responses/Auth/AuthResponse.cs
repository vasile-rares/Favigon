using System.Text.Json.Serialization;

namespace Favigon.Application.DTOs.Responses;

public class AuthResponse
{
  public int UserId { get; set; }
  public string DisplayName { get; set; } = string.Empty;
  public string Username { get; set; } = string.Empty;
  public string Email { get; set; } = string.Empty;
  public string? ProfilePictureUrl { get; set; }
  public string Role { get; set; } = string.Empty;
  public bool RequiresTwoFactor { get; set; }
  public string? TwoFactorToken { get; set; }
  public string? TwoFactorEmailHint { get; set; }
  public string Token { get; set; } = string.Empty;
  public DateTime ExpiresAt { get; set; }

  [JsonIgnore]
  public string RefreshToken { get; set; } = string.Empty;
}
