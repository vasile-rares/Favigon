namespace Favigon.Application.Helpers;

public static class ImageUploadValidator
{
  public static void Validate(ImageUploadRequest request)
  {
    if (request.Length <= 0)
      throw new ArgumentException($"{request.AssetLabel} is empty.");

    if (request.Length > request.MaxBytes)
      throw new ArgumentException($"{request.AssetLabel} exceeds the {request.MaxBytes / 1024 / 1024} MB limit.");

    if (string.IsNullOrWhiteSpace(request.FileName))
      throw new ArgumentException($"{request.AssetLabel} name is required.");

    if (request.Content == Stream.Null || !request.Content.CanRead)
      throw new ArgumentException($"{request.AssetLabel} content is not readable.");

    if (string.IsNullOrWhiteSpace(request.ContentType) || !request.AllowedTypes.Contains(request.ContentType))
      throw new ArgumentException(request.UnsupportedFormatMessage);
  }
}
