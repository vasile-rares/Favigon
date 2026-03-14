using System.ComponentModel.DataAnnotations;

namespace Favigon.Application.DTOs.Requests;

public class LoginRequest
{
  [Required]
  [EmailAddress]
  [MaxLength(100)]
  public string Email { get; set; } = string.Empty;

  [Required]
  [MaxLength(100)]
  public string Password { get; set; } = string.Empty;
}
