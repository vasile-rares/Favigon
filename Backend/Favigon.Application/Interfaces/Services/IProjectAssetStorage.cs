namespace Favigon.Application.Interfaces;

public interface IProjectAssetStorage
{
  Task<string> SaveImageAsync(
    int userId,
    int projectId,
    Stream content,
    string fileName,
    string? contentType,
    CancellationToken cancellationToken = default);

  Task<string> SaveThumbnailAsync(
    int userId,
    int projectId,
    Stream content,
    string? contentType,
    CancellationToken cancellationToken = default);

  string? GetThumbnailUrl(
    int userId,
    int projectId);

  Task DeleteAssetsAsync(
    int userId,
    int projectId,
    IEnumerable<string> assetPaths,
    CancellationToken cancellationToken = default);

  Task DeleteProjectAssetsAsync(
    int userId,
    int projectId,
    CancellationToken cancellationToken = default);
}