namespace Favigon.Application.DTOs.Requests;

public class UserProfileImageUploadRequest
{
  public Stream Content { get; set; } = Stream.Null;
  public string FileName { get; set; } = string.Empty;
  public string? ContentType { get; set; }
  public long Length { get; set; }
}