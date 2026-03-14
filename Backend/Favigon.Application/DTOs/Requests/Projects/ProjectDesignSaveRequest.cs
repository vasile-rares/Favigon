using System.ComponentModel.DataAnnotations;

namespace Favigon.Application.DTOs.Requests;

public class ProjectDesignSaveRequest
{
  [Required]
  public string DesignJson { get; set; } = "{}";
}
