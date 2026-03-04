using System.ComponentModel.DataAnnotations;
using Prismatic.Converter.Models;

namespace Prismatic.Application.DTOs.Requests;

public class ConverterRequest
{
  [Required]
  public string Framework { get; set; } = "html";

  [Required]
  public IRNode? Ir { get; set; }
}
