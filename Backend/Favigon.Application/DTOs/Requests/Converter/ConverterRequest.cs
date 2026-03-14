using System.ComponentModel.DataAnnotations;
using Favigon.Converter.Models;

namespace Favigon.Application.DTOs.Requests;

public class ConverterRequest
{
  [Required]
  public string Framework { get; set; } = "html";

  [Required]
  public IRNode? Ir { get; set; }
}
