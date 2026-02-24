using System.ComponentModel.DataAnnotations;

namespace Prismatic.Application.DTOs.Requests;

public class GithubAuthRequest
{
  [Required]
  public string Code { get; set; } = string.Empty;
}
