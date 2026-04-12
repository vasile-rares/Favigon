using System.ComponentModel.DataAnnotations;

namespace Favigon.Application.DTOs.Requests;

public class ChangePasswordRequest
{
  [Required]
  [MaxLength(100)]
  public string CurrentPassword { get; set; } = string.Empty;

  [Required]
  [MinLength(8)]
  [MaxLength(100)]
  [RegularExpression(@"^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$", ErrorMessage = "Password must contain at least one lowercase letter, one uppercase letter, one digit, and be at least 8 characters long.")]
  public string NewPassword { get; set; } = string.Empty;
}