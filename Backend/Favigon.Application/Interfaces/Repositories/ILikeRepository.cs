using Favigon.Domain.Entities;

namespace Favigon.Application.Interfaces;

public interface ILikeRepository
{
  Task<ProjectLike?> GetAsync(int userId, int projectId);
  Task AddAsync(ProjectLike like);
  Task DeleteAsync(ProjectLike like);
  Task<int> GetCountForProjectAsync(int projectId);
  Task<bool> IsLikedAsync(int userId, int projectId);
  Task<HashSet<int>> GetLikedProjectIdsAsync(int userId, IEnumerable<int> projectIds);
}
