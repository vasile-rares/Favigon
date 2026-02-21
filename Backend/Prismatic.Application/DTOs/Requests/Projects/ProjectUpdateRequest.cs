using System.ComponentModel.DataAnnotations;

namespace Prismatic.Application.DTOs.Requests;

public class ProjectUpdateRequest
{
  [Required, MaxLength(100)]
  public string Name { get; set; } = string.Empty;

  public bool IsPublic { get; set; }
}
