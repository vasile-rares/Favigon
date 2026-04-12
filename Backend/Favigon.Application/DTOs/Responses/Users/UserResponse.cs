namespace Favigon.Application.DTOs.Responses;

public class UserResponse
{
  public int UserId { get; set; }
  public string DisplayName { get; set; } = string.Empty;
  public string Username { get; set; } = string.Empty;
  public string Email { get; set; } = string.Empty;
  public bool HasPassword { get; set; }
  public string Role { get; set; } = string.Empty;
  public string? ProfilePictureUrl { get; set; }
  public string? Bio { get; set; }
  public DateTime CreatedAt { get; set; }
  public IReadOnlyList<LinkedAccountResponse> LinkedAccounts { get; set; } = [];
}
