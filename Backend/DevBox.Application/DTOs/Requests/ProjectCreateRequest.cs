using System.ComponentModel.DataAnnotations;

namespace DevBox.Application.DTOs.Requests;

public class ProjectCreateRequest
{
  [Required]
  public int UserId { get; set; }

  [Required, MaxLength(100)]
  public string Name { get; set; } = string.Empty;

  [Required, MaxLength(20)]
  [RegularExpression("^(Vanilla|React|Angular)$", ErrorMessage = "Type must be Vanilla, React, or Angular")]
  public string Type { get; set; } = string.Empty;

  [Required, MaxLength(260)]
  public string RootPath { get; set; } = string.Empty;

  public bool IsPublic { get; set; }
}
