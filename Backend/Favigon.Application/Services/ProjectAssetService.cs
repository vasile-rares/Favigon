using Favigon.Application.DTOs.Requests;
using Favigon.Application.Helpers;
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

    ImageUploadValidator.Validate(
      request.Content,
      request.FileName,
      request.ContentType,
      request.Length,
      MaxImageSizeBytes,
      AllowedContentTypes,
      "Image file",
      "Only PNG, JPEG, WebP, GIF, and AVIF images are supported.");

    return await _projectAssetStorage.SaveImageAsync(
      userId,
      projectId,
      request.Content,
      request.FileName,
      request.ContentType,
      cancellationToken);
  }
}