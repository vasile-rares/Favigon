namespace Prismatic.Application.DTOs.Requests;

public class ProjectFileUpdateRequest
{
  public string Path { get; set; } = string.Empty;
  public string Content { get; set; } = string.Empty;
}
