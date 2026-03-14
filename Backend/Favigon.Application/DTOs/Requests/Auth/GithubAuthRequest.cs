using System.ComponentModel.DataAnnotations;

namespace Favigon.Application.DTOs.Requests;

public class GithubAuthRequest
{
  [Required]
  public string Code { get; set; } = string.Empty;
}
