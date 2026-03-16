using System.ComponentModel.DataAnnotations;

namespace Favigon.Application.DTOs.Requests;

public class UserProfileUpdateRequest
{
  [Required, MaxLength(50)]
  public string DisplayName { get; set; } = string.Empty;

  [Required, MaxLength(30)]
  [RegularExpression(@"^[a-z0-9_]+$", ErrorMessage = "Username can only contain lowercase letters, numbers, and underscores")]
  public string Username { get; set; } = string.Empty;

  [MaxLength(300)]
  public string? Bio { get; set; }
}
