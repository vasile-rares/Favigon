using Favigon.Application.DTOs.Requests;
using Favigon.Application.Interfaces;

namespace Favigon.Application.Services;

public class ProjectAssetService : IProjectAssetService
{
  private const long MaxImageSizeBytes = 10 * 1024 * 1024;

  private static readonly HashSet<string> AllowedContentTypes = new(StringComparer.OrdinalIgnoreCase)
  {
    "image/png",
    "image/jpeg",
    "image/webp",
    "image/gif",
    "image/avif"
  };

  private readonly IProjectRepository _projectRepository;
  private readonly IProjectAssetStorage _projectAssetStorage;

  public ProjectAssetService(
    IProjectRepository projectRepository,
    IProjectAssetStorage projectAssetStorage)
  {
    _projectRepository = projectRepository;
    _projectAssetStorage = projectAssetStorage;
  }

  public async Task<string?> UploadImageAsync(
    int projectId,
    int userId,
    ProjectImageUploadRequest request,
    CancellationToken cancellationToken = default)
  {
    var project = await _projectRepository.GetByIdAsync(projectId, userId);
    if (project == null)
    {
      return null;
    }

    if (request.Length <= 0)
    {
      throw new ArgumentException("Image file is empty.");
    }

    if (request.Length > MaxImageSizeBytes)
    {
      throw new ArgumentException("Image file exceeds the 10 MB limit.");
    }

    if (string.IsNullOrWhiteSpace(request.FileName))
    {
      throw new ArgumentException("Image file name is required.");
    }

    if (request.Content == Stream.Null || !request.Content.CanRead)
    {
      throw new ArgumentException("Image file content is not readable.");
    }

    if (string.IsNullOrWhiteSpace(request.ContentType)
      || !AllowedContentTypes.Contains(request.ContentType))
    {
      throw new ArgumentException("Only PNG, JPEG, WebP, GIF, and AVIF images are supported.");
    }

    return await _projectAssetStorage.SaveImageAsync(
      userId,
      projectId,
      request.Content,
      request.FileName,
      request.ContentType,
      cancellationToken);
  }
}