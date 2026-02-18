namespace Prismatic.Application.DTOs.Responses;

public class UserResponse
{
  public int UserId { get; set; }
  public string DisplayName { get; set; } = string.Empty;
  public string Username { get; set; } = string.Empty;
  public string Email { get; set; } = string.Empty;
  public string Role { get; set; } = string.Empty;
}
