using Favigon.Application.DTOs.Requests;

namespace Favigon.Application.Interfaces;

public interface IProjectAssetService
{
  Task<string?> UploadImageAsync(
    int projectId,
    int userId,
    ProjectImageUploadRequest request,
    CancellationToken cancellationToken = default);
}