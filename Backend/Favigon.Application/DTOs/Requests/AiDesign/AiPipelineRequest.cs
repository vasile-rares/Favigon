using System.ComponentModel.DataAnnotations;
using Favigon.Converter.Models;

namespace Favigon.Application.DTOs.Requests;

public class AiPipelineRequest
{
  [Required]
  [StringLength(2000, MinimumLength = 3)]
  public string Prompt { get; set; } = "";

  public IRNode? ExistingIr { get; set; }

  [Range(320, 3840)]
  public int ViewportWidth { get; set; } = 1280;

  [AllowedValues("gpt-5.4", "gpt-5.4-mini", null)]
  public string? Model { get; set; }

  [Range(1, 3)]
  public int StopAfterPhase { get; set; } = 3;
}
