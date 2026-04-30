namespace Favigon.Application.Helpers;

/// <summary>
/// Encapsulates all parameters required by <see cref="ImageUploadValidator.Validate"/>.
/// </summary>
public record ImageUploadRequest(
    Stream Content,
    string? FileName,
    string? ContentType,
    long Length,
    long MaxBytes,
    IReadOnlySet<string> AllowedTypes,
    string AssetLabel,
    string UnsupportedFormatMessage);
