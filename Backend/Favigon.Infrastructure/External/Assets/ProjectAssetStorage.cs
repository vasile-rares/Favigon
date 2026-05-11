using System.Globalization;
using Favigon.Application.Interfaces;
using Microsoft.AspNetCore.Hosting;

namespace Favigon.Infrastructure.External.Assets;

public class ProjectAssetStorage : IProjectAssetStorage, IUserProfileImageStorage
{
  private const string ThumbnailFileStem = "thumbnail";
  private const string AvatarSubdirectoryName = "avatar";
  private const string ProjectsSubdirectoryName = "projects";
  private const string AssetsSubdirectoryName = "assets";

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
    var assetsDirectory = GetProjectAssetsSubdirectory(userId, projectId);
    Directory.CreateDirectory(assetsDirectory);

    var storedFileName = $"{Guid.NewGuid():N}{extension}";
    var physicalPath = Path.Combine(assetsDirectory, storedFileName);

    await using var destination = new FileStream(physicalPath, FileMode.CreateNew, FileAccess.Write, FileShare.None);
    await content.CopyToAsync(destination, cancellationToken);

    return BuildProjectAssetFileUrl(userId, projectId, storedFileName);
  }

  public async Task<string> SaveThumbnailAsync(
    int userId,
    int projectId,
    Stream content,
    string? contentType,
    CancellationToken cancellationToken = default)
  {
    var extension = ResolveExtension(null, contentType);
    var projectDirectory = GetProjectDirectory(userId, projectId);
    Directory.CreateDirectory(projectDirectory);

    DeleteExistingThumbnailFiles(projectDirectory);

    var storedFileName = $"{ThumbnailFileStem}{extension}";
    var physicalPath = Path.Combine(projectDirectory, storedFileName);

    await using var destination = new FileStream(physicalPath, FileMode.Create, FileAccess.Write, FileShare.None);
    await content.CopyToAsync(destination, cancellationToken);

    return BuildProjectThumbnailUrl(userId, projectId, storedFileName);
  }

  public async Task<string> SaveImageAsync(
    int userId,
    Stream content,
    string fileName,
    string? contentType,
    CancellationToken cancellationToken = default)
  {
    var extension = ResolveExtension(fileName, contentType);
    var avatarDirectory = GetAvatarDirectory(userId);
    Directory.CreateDirectory(avatarDirectory);

    var storedFileName = $"{Guid.NewGuid():N}{extension}";
    var physicalPath = Path.Combine(avatarDirectory, storedFileName);

    await using var destination = new FileStream(physicalPath, FileMode.CreateNew, FileAccess.Write, FileShare.None);
    await content.CopyToAsync(destination, cancellationToken);

    return BuildAvatarUrl(userId, storedFileName);
  }

  public Task DeleteImageAsync(
    int userId,
    string imageUrlOrPath,
    CancellationToken cancellationToken = default)
  {
    cancellationToken.ThrowIfCancellationRequested();

    var avatarDirectory = Path.GetFullPath(GetAvatarDirectory(userId));
    var physicalPath = TryResolveAvatarPath(avatarDirectory, userId, imageUrlOrPath);
    if (physicalPath == null || !File.Exists(physicalPath))
    {
      return Task.CompletedTask;
    }

    File.Delete(physicalPath);
    DeleteDirectoryIfEmpty(avatarDirectory);

    return Task.CompletedTask;
  }

  public Task DeleteUserAssetsAsync(
    int userId,
    CancellationToken cancellationToken = default)
  {
    cancellationToken.ThrowIfCancellationRequested();

    var assetDirectory = GetUserRootDirectory(userId);
    if (Directory.Exists(assetDirectory))
    {
      Directory.Delete(assetDirectory, recursive: true);
    }

    return Task.CompletedTask;
  }

  public string? GetThumbnailUrl(int userId, int projectId)
  {
    var projectDirectory = GetProjectDirectory(userId, projectId);
    if (!Directory.Exists(projectDirectory))
    {
      return null;
    }

    var thumbnailPath = Directory
      .EnumerateFiles(projectDirectory, $"{ThumbnailFileStem}.*", SearchOption.TopDirectoryOnly)
      .OrderByDescending(File.GetLastWriteTimeUtc)
      .FirstOrDefault();
    if (string.IsNullOrWhiteSpace(thumbnailPath))
    {
      return null;
    }

    var fileName = Path.GetFileName(thumbnailPath);
    var version = File.GetLastWriteTimeUtc(thumbnailPath).Ticks.ToString(CultureInfo.InvariantCulture);
    return $"{BuildProjectThumbnailUrl(userId, projectId, fileName)}?v={version}";
  }

  public Task DeleteAssetsAsync(
    int userId,
    int projectId,
    IEnumerable<string> assetPaths,
    CancellationToken cancellationToken = default)
  {
    var assetsSubdirectory = Path.GetFullPath(GetProjectAssetsSubdirectory(userId, projectId));

    foreach (var assetPath in assetPaths.Distinct(StringComparer.OrdinalIgnoreCase))
    {
      cancellationToken.ThrowIfCancellationRequested();

      var physicalPath = TryResolveProjectAssetPath(assetsSubdirectory, userId, projectId, assetPath);
      if (physicalPath == null || !File.Exists(physicalPath))
      {
        continue;
      }

      File.Delete(physicalPath);
    }

    DeleteDirectoryIfEmpty(assetsSubdirectory);

    return Task.CompletedTask;
  }

  public Task DeleteProjectAssetsAsync(
    int userId,
    int projectId,
    CancellationToken cancellationToken = default)
  {
    cancellationToken.ThrowIfCancellationRequested();

    var projectDirectory = GetProjectDirectory(userId, projectId);
    if (Directory.Exists(projectDirectory))
    {
      Directory.Delete(projectDirectory, recursive: true);
    }

    var projectsDirectory = GetProjectsRootDirectory(userId);
    DeleteDirectoryIfEmpty(projectsDirectory);

    return Task.CompletedTask;
  }

  private string GetUserRootDirectory(int userId)
  {
    return Path.Combine(
      GetWebRootPath(),
      userId.ToString(CultureInfo.InvariantCulture));
  }

  private string GetAvatarDirectory(int userId)
  {
    return Path.Combine(
      GetUserRootDirectory(userId),
      AvatarSubdirectoryName);
  }

  private string GetProjectsRootDirectory(int userId)
  {
    return Path.Combine(
      GetUserRootDirectory(userId),
      ProjectsSubdirectoryName);
  }

  private string GetProjectDirectory(int userId, int projectId)
  {
    return Path.Combine(
      GetProjectsRootDirectory(userId),
      projectId.ToString(CultureInfo.InvariantCulture));
  }

  private string GetProjectAssetsSubdirectory(int userId, int projectId)
  {
    return Path.Combine(
      GetProjectDirectory(userId, projectId),
      AssetsSubdirectoryName);
  }

  private string GetWebRootPath()
  {
    return string.IsNullOrWhiteSpace(_webHostEnvironment.WebRootPath)
      ? Path.Combine(_webHostEnvironment.ContentRootPath, "wwwroot")
      : _webHostEnvironment.WebRootPath;
  }

  private static string? TryResolveProjectAssetPath(
    string assetsSubdirectory,
    int userId,
    int projectId,
    string assetPath)
  {
    if (string.IsNullOrWhiteSpace(assetPath))
    {
      return null;
    }

    var normalizedPath = ExtractAssetPath(assetPath).Replace('\\', '/');
    var expectedPrefix = $"/{userId.ToString(CultureInfo.InvariantCulture)}/{ProjectsSubdirectoryName}/{projectId.ToString(CultureInfo.InvariantCulture)}/{AssetsSubdirectoryName}/";
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
      assetsSubdirectory,
      relativePath.Replace('/', Path.DirectorySeparatorChar)));

    return physicalPath.StartsWith(assetsSubdirectory, StringComparison.OrdinalIgnoreCase)
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

  private static string? TryResolveAvatarPath(
    string avatarDirectory,
    int userId,
    string imageUrlOrPath)
  {
    if (string.IsNullOrWhiteSpace(imageUrlOrPath))
    {
      return null;
    }

    var normalizedPath = ExtractAssetPath(imageUrlOrPath).Replace('\\', '/');
    if (!normalizedPath.StartsWith('/'))
    {
      normalizedPath = $"/{normalizedPath.TrimStart('/')}";
    }

    var expectedPrefix = $"/{userId.ToString(CultureInfo.InvariantCulture)}/{AvatarSubdirectoryName}/";
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
      avatarDirectory,
      relativePath.Replace('/', Path.DirectorySeparatorChar)));

    return physicalPath.StartsWith(avatarDirectory, StringComparison.OrdinalIgnoreCase)
      ? physicalPath
      : null;
  }

  private static string BuildProjectThumbnailUrl(int userId, int projectId, string fileName)
  {
    return $"/{userId.ToString(CultureInfo.InvariantCulture)}/{ProjectsSubdirectoryName}/{projectId.ToString(CultureInfo.InvariantCulture)}/{fileName}";
  }

  private static string BuildProjectAssetFileUrl(int userId, int projectId, string fileName)
  {
    return $"/{userId.ToString(CultureInfo.InvariantCulture)}/{ProjectsSubdirectoryName}/{projectId.ToString(CultureInfo.InvariantCulture)}/{AssetsSubdirectoryName}/{fileName}";
  }

  private static string BuildAvatarUrl(int userId, string fileName)
  {
    return $"/{userId.ToString(CultureInfo.InvariantCulture)}/{AvatarSubdirectoryName}/{fileName}";
  }

  private static string ExtractAssetPath(string imageUrlOrPath)
  {
    return Uri.TryCreate(imageUrlOrPath, UriKind.Absolute, out var absoluteUri)
      ? absoluteUri.AbsolutePath
      : imageUrlOrPath;
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