using Favigon.Domain.Entities;

namespace Favigon.Application.Interfaces;

public interface IBookmarkRepository
{
  Task<ProjectBookmark?> GetAsync(int userId, int projectId);
  Task AddAsync(ProjectBookmark bookmark);
  Task DeleteAsync(ProjectBookmark bookmark);
  Task<int> GetCountForProjectAsync(int projectId);
  Task<bool> IsBookmarkedAsync(int userId, int projectId);
  Task<HashSet<int>> GetStarredProjectIdsAsync(int userId, IEnumerable<int> projectIds);
  Task<IReadOnlyList<Project>> GetBookmarkedProjectsAsync(int userId);
}
