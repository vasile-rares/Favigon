namespace Favigon.Application.DTOs.Responses;

public class MultiPageConverterResponse
{
  public string Framework { get; set; } = string.Empty;
  public bool IsValid { get; set; }
  public List<GeneratedFileDto> Files { get; set; } = [];
}
