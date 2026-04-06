using System.ComponentModel.DataAnnotations;
using Favigon.Converter.Models;

namespace Favigon.Application.DTOs.Requests;

public class ConverterRequest
{
  [Required]
  public string Framework { get; set; } = "html";

  public IRNode? Ir { get; set; }

  public List<ConverterPageInput>? Pages { get; set; }
}
