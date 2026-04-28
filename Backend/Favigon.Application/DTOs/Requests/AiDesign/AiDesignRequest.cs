using System.ComponentModel.DataAnnotations;
using Favigon.Converter.Models;

namespace Favigon.Application.DTOs.Requests;

public class AiDesignRequest
{
  [Required]
  [StringLength(2000, MinimumLength = 3)]
  public string Prompt { get; set; } = "";

  public IRNode? ExistingIr { get; set; }

  [Range(320, 3840)]
  public int ViewportWidth { get; set; } = 1280;

  [StringLength(100)]
  public string? Model { get; set; }
}
