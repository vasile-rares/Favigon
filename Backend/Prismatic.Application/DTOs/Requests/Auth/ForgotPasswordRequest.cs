using System.ComponentModel.DataAnnotations;

namespace Prismatic.Application.DTOs.Requests;

public class ForgotPasswordRequest
{
  [Required]
  [EmailAddress]
  [MaxLength(100)]
  public string Email { get; set; } = string.Empty;
}