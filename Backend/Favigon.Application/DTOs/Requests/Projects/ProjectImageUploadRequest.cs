namespace Favigon.Application.DTOs.Requests;

public class ProjectImageUploadRequest
{
  public Stream Content { get; init; } = Stream.Null;
  public string FileName { get; init; } = string.Empty;
  public string? ContentType { get; init; }
  public long Length { get; init; }
}