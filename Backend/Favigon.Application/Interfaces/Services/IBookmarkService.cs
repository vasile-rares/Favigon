using Favigon.Application.DTOs.Responses;

namespace Favigon.Application.Interfaces;

public interface IBookmarkService
{
  Task BookmarkAsync(int userId, int projectId);
  Task UnbookmarkAsync(int userId, int projectId);
  Task<IReadOnlyList<ProjectResponse>> GetMyBookmarksAsync(int userId);
}
