using System.ComponentModel.DataAnnotations;

namespace Favigon.Application.DTOs.Requests;

public class TwoFactorLoginVerifyRequest
{
  [Required]
  [MaxLength(512)]
  public string Token { get; set; } = string.Empty;

  [Required]
  [RegularExpression(@"^\d{6}$", ErrorMessage = "Verification code must be 6 digits.")]
  [MaxLength(6)]
  public string Code { get; set; } = string.Empty;
}