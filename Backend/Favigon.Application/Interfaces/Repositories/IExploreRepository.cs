using Favigon.Domain.Entities;

namespace Favigon.Application.Interfaces;

public interface IExploreRepository
{
  Task<IReadOnlyList<Project>> GetTrendingProjectsAsync(int limit);
  Task<IReadOnlyList<Project>> GetRecommendedProjectsAsync(int viewerUserId, int limit);
  Task<IReadOnlyList<User>> GetSuggestedUsersAsync(int viewerUserId, int limit);
}
