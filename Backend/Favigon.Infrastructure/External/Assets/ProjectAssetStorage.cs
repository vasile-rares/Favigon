using System.Globalization;
using Favigon.Application.Interfaces;
using Microsoft.AspNetCore.Hosting;

namespace Favigon.Infrastructure.External.Assets;

public class ProjectAssetStorage : IProjectAssetStorage
{
  private const string ThumbnailFileStem = "thumbnail";

  private static readonly IReadOnlyDictionary<string, string> ContentTypeExtensions =
    new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
    {
      ["image/png"] = ".png",
      ["image/jpeg"] = ".jpg",
      ["image/webp"] = ".webp",
      ["image/gif"] = ".gif",
      ["image/avif"] = ".avif"
    };

  private readonly IWebHostEnvironment _webHostEnvironment;

  public ProjectAssetStorage(IWebHostEnvironment webHostEnvironment)
  {
    _webHostEnvironment = webHostEnvironment;
  }

  public async Task<string> SaveImageAsync(
    int userId,
    int projectId,
    Stream content,
    string fileName,
    string? contentType,
    CancellationToken cancellationToken = default)
  {
    var extension = ResolveExtension(fileName, contentType);
    var assetDirectory = GetProjectAssetDirectory(userId, projectId);
    Directory.CreateDirectory(assetDirectory);

    var storedFileName = $"{Guid.NewGuid():N}{extension}";
    var physicalPath = Path.Combine(assetDirectory, storedFileName);

    await using var destination = new FileStream(physicalPath, FileMode.CreateNew, FileAccess.Write, FileShare.None);
    await content.CopyToAsync(destination, cancellationToken);

    return $"/project-assets/{userId.ToString(CultureInfo.InvariantCulture)}/{projectId.ToString(CultureInfo.InvariantCulture)}/{storedFileName}";
  }

  public async Task<string> SaveThumbnailAsync(
    int userId,
    int projectId,
    Stream content,
    string? contentType,
    CancellationToken cancellationToken = default)
  {
    var extension = ResolveExtension(null, contentType);
    var assetDirectory = GetProjectAssetDirectory(userId, projectId);
    Directory.CreateDirectory(assetDirectory);

    DeleteExistingThumbnailFiles(assetDirectory);

    var storedFileName = $"{ThumbnailFileStem}{extension}";
    var physicalPath = Path.Combine(assetDirectory, storedFileName);

    await using var destination = new FileStream(physicalPath, FileMode.Create, FileAccess.Write, FileShare.None);
    await content.CopyToAsync(destination, cancellationToken);

    return BuildProjectAssetUrl(userId, projectId, storedFileName);
  }

  public string? GetThumbnailUrl(int userId, int projectId)
  {
    var assetDirectory = GetProjectAssetDirectory(userId, projectId);
    if (!Directory.Exists(assetDirectory))
    {
      return null;
    }

    var thumbnailPath = Directory
      .EnumerateFiles(assetDirectory, $"{ThumbnailFileStem}.*", SearchOption.TopDirectoryOnly)
      .OrderByDescending(File.GetLastWriteTimeUtc)
      .FirstOrDefault();
    if (string.IsNullOrWhiteSpace(thumbnailPath))
    {
      return null;
    }

    var fileName = Path.GetFileName(thumbnailPath);
    var version = File.GetLastWriteTimeUtc(thumbnailPath).Ticks.ToString(CultureInfo.InvariantCulture);
    return $"{BuildProjectAssetUrl(userId, projectId, fileName)}?v={version}";
  }

  public Task DeleteAssetsAsync(
    int userId,
    int projectId,
    IEnumerable<string> assetPaths,
    CancellationToken cancellationToken = default)
  {
    var projectDirectory = Path.GetFullPath(GetProjectAssetDirectory(userId, projectId));

    foreach (var assetPath in assetPaths.Distinct(StringComparer.OrdinalIgnoreCase))
    {
      cancellationToken.ThrowIfCancellationRequested();

      var physicalPath = TryResolveProjectAssetPath(projectDirectory, userId, projectId, assetPath);
      if (physicalPath == null || !File.Exists(physicalPath))
      {
        continue;
      }

      File.Delete(physicalPath);
    }

    DeleteDirectoryIfEmpty(projectDirectory);
    var userDirectory = Path.GetDirectoryName(projectDirectory);
    if (!string.IsNullOrWhiteSpace(userDirectory))
    {
      DeleteDirectoryIfEmpty(userDirectory);
    }

    return Task.CompletedTask;
  }

  public Task DeleteProjectAssetsAsync(
    int userId,
    int projectId,
    CancellationToken cancellationToken = default)
  {
    cancellationToken.ThrowIfCancellationRequested();

    var assetDirectory = GetProjectAssetDirectory(userId, projectId);
    if (Directory.Exists(assetDirectory))
    {
      Directory.Delete(assetDirectory, recursive: true);
    }

    return Task.CompletedTask;
  }

  private string GetProjectAssetDirectory(int userId, int projectId)
  {
    return Path.Combine(
      GetWebRootPath(),
      "project-assets",
      userId.ToString(CultureInfo.InvariantCulture),
      projectId.ToString(CultureInfo.InvariantCulture));
  }

  private string GetWebRootPath()
  {
    return string.IsNullOrWhiteSpace(_webHostEnvironment.WebRootPath)
      ? Path.Combine(_webHostEnvironment.ContentRootPath, "wwwroot")
      : _webHostEnvironment.WebRootPath;
  }

  private static string? TryResolveProjectAssetPath(
    string projectDirectory,
    int userId,
    int projectId,
    string assetPath)
  {
    if (string.IsNullOrWhiteSpace(assetPath))
    {
      return null;
    }

    var normalizedPath = assetPath.Replace('\\', '/');
    var expectedPrefix = $"/project-assets/{userId.ToString(CultureInfo.InvariantCulture)}/{projectId.ToString(CultureInfo.InvariantCulture)}/";
    if (!normalizedPath.StartsWith(expectedPrefix, StringComparison.OrdinalIgnoreCase))
    {
      return null;
    }

    var relativePath = Uri.UnescapeDataString(normalizedPath[expectedPrefix.Length..]).TrimStart('/');
    if (string.IsNullOrWhiteSpace(relativePath))
    {
      return null;
    }

    var physicalPath = Path.GetFullPath(Path.Combine(
      projectDirectory,
      relativePath.Replace('/', Path.DirectorySeparatorChar)));

    return physicalPath.StartsWith(projectDirectory, StringComparison.OrdinalIgnoreCase)
      ? physicalPath
      : null;
  }

  private static void DeleteDirectoryIfEmpty(string directoryPath)
  {
    if (!Directory.Exists(directoryPath))
    {
      return;
    }

    if (Directory.EnumerateFileSystemEntries(directoryPath).Any())
    {
      return;
    }

    Directory.Delete(directoryPath);
  }

  private static void DeleteExistingThumbnailFiles(string assetDirectory)
  {
    if (!Directory.Exists(assetDirectory))
    {
      return;
    }

    foreach (var filePath in Directory.EnumerateFiles(
      assetDirectory,
      $"{ThumbnailFileStem}.*",
      SearchOption.TopDirectoryOnly))
    {
      File.Delete(filePath);
    }
  }

  private static string BuildProjectAssetUrl(int userId, int projectId, string fileName)
  {
    return $"/project-assets/{userId.ToString(CultureInfo.InvariantCulture)}/{projectId.ToString(CultureInfo.InvariantCulture)}/{fileName}";
  }

  private static string ResolveExtension(string? fileName, string? contentType)
  {
    var extension = string.IsNullOrWhiteSpace(fileName) ? string.Empty : Path.GetExtension(fileName);
    if (!string.IsNullOrWhiteSpace(extension))
    {
      return extension.ToLowerInvariant();
    }

    if (!string.IsNullOrWhiteSpace(contentType)
      && ContentTypeExtensions.TryGetValue(contentType, out var mappedExtension))
    {
      return mappedExtension;
    }

    return ".bin";
  }
}