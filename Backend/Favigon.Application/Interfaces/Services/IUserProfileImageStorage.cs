namespace Favigon.Application.Interfaces;

public interface IUserProfileImageStorage
{
  Task<string> SaveImageAsync(
    int userId,
    Stream content,
    string fileName,
    string? contentType,
    CancellationToken cancellationToken = default);

  Task DeleteImageAsync(
    int userId,
    string imageUrlOrPath,
    CancellationToken cancellationToken = default);

  Task DeleteUserAssetsAsync(
    int userId,
    CancellationToken cancellationToken = default);
}