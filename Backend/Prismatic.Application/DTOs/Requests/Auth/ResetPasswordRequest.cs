using System.ComponentModel.DataAnnotations;

namespace Prismatic.Application.DTOs.Requests;

public class ResetPasswordRequest
{
  [Required]
  [MaxLength(512)]
  public string Token { get; set; } = string.Empty;

  [Required]
  [MinLength(8)]
  [MaxLength(100)]
  [RegularExpression(@"^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$", ErrorMessage = "Password must contain at least one lowercase letter, one uppercase letter, one digit, and be at least 8 characters long.")]
  public string Password { get; set; } = string.Empty;
}