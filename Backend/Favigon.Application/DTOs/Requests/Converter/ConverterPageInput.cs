using Favigon.Converter.Models;

namespace Favigon.Application.DTOs.Requests;

public class ConverterPageInput
{
  public int ViewportWidth { get; set; } = 1280;
  public string PageName { get; set; } = "";
  public IRNode Ir { get; set; } = new();
}
