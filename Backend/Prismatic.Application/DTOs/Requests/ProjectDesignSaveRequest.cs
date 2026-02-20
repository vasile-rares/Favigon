using System.ComponentModel.DataAnnotations;

namespace Prismatic.Application.DTOs.Requests;

public class ProjectDesignSaveRequest
{
  [Required]
  public string DesignJson { get; set; } = "{}";
}
