namespace Prismatic.Application.DTOs.Responses;

public class ProjectFileEntryResponse
{
  public string Path { get; set; } = string.Empty;
  public string Name { get; set; } = string.Empty;
  public string Extension { get; set; } = string.Empty;
  public long Size { get; set; }
}
