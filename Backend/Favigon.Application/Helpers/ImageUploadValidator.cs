namespace Favigon.Application.Helpers;

public static class ImageUploadValidator
{
  public static void Validate(
    Stream content,
    string? fileName,
    string? contentType,
    long length,
    long maxBytes,
    IReadOnlySet<string> allowedTypes,
    string assetLabel,
    string unsupportedFormatMessage)
  {
    if (length <= 0)
      throw new ArgumentException($"{assetLabel} is empty.");

    if (length > maxBytes)
      throw new ArgumentException($"{assetLabel} exceeds the {maxBytes / 1024 / 1024} MB limit.");

    if (string.IsNullOrWhiteSpace(fileName))
      throw new ArgumentException($"{assetLabel} name is required.");

    if (content == Stream.Null || !content.CanRead)
      throw new ArgumentException($"{assetLabel} content is not readable.");

    if (string.IsNullOrWhiteSpace(contentType) || !allowedTypes.Contains(contentType))
      throw new ArgumentException(unsupportedFormatMessage);
  }
}
