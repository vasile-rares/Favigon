using System.ComponentModel.DataAnnotations;

namespace Favigon.Application.DTOs.Requests;

public class GoogleAuthRequest
{
  [Required]
  public string Code { get; set; } = string.Empty;
}