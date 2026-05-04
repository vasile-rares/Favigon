using Favigon.Application.DTOs.Responses.Explore;

namespace Favigon.Application.Interfaces;

public interface IExploreService
{
  Task<IReadOnlyList<ExploreProjectDto>> GetTrendingAsync(int viewerUserId);
  Task<(IReadOnlyList<ExploreProjectDto> Projects, bool IsPersonalized)> GetRecommendedAsync(int viewerUserId);
  Task<IReadOnlyList<ExploreUserDto>> GetSuggestedPeopleAsync(int viewerUserId);
}
