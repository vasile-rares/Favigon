namespace Favigon.Application.DTOs.Requests.Assets;

public record ImageUploadRequest(
    Stream Content,
    string? FileName,
    string? ContentType,
    long Length,
    long MaxBytes,
    IReadOnlySet<string> AllowedTypes,
    string AssetLabel,
    string UnsupportedFormatMessage);
