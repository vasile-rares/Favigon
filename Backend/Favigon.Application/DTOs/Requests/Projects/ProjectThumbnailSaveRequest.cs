using System.ComponentModel.DataAnnotations;

namespace Favigon.Application.DTOs.Requests;

public class ProjectThumbnailSaveRequest
{
  [Required]
  public string ThumbnailDataUrl { get; set; } = string.Empty;
}
