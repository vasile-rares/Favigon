using System.ComponentModel.DataAnnotations;

namespace Favigon.Application.DTOs.Requests;

public class UserCreateRequest
{
  [Required, MaxLength(50)]
  public string DisplayName { get; set; } = string.Empty;

  [Required, MaxLength(30)]
  [RegularExpression(@"^[a-z0-9_]+$", ErrorMessage = "Username can only contain lowercase letters, numbers, and underscores")]
  public string Username { get; set; } = string.Empty;

  [Required, MaxLength(100)]
  [EmailAddress]
  public string Email { get; set; } = string.Empty;

  [Required, MinLength(8), MaxLength(100)]
  public string Password { get; set; } = string.Empty;

  [MaxLength(255)]
  public string? ProfilePictureUrl { get; set; }

  [MaxLength(20)]
  public string? Role { get; set; }
}
