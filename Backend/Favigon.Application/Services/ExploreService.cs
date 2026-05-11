using Favigon.Application.DTOs.Responses.Explore;
using Favigon.Application.Interfaces;
using Favigon.Domain.Entities;

namespace Favigon.Application.Services;

public class ExploreService : IExploreService
{
  private const int TrendingLimit = 20;
  private const int RecommendedLimit = 12;
  private const int PeopleLimit = 12;

  private readonly IExploreRepository _exploreRepository;
  private readonly IProjectRepository _projectRepository;
  private readonly IUserRepository _userRepository;
  private readonly IProjectAssetStorage _projectAssetStorage;

  public ExploreService(
    IExploreRepository exploreRepository,
    IProjectRepository projectRepository,
    IUserRepository userRepository,
    IProjectAssetStorage projectAssetStorage)
  {
    _exploreRepository = exploreRepository;
    _projectRepository = projectRepository;
    _userRepository = userRepository;
    _projectAssetStorage = projectAssetStorage;
  }

  public async Task<IReadOnlyList<ExploreProjectDto>> GetTrendingAsync(int viewerUserId)
  {
    var projects = await _exploreRepository.GetTrendingProjectsAsync(TrendingLimit);
    return await MapProjectsAsync(projects, viewerUserId);
  }

  public async Task<(IReadOnlyList<ExploreProjectDto> Projects, bool IsPersonalized)> GetRecommendedAsync(int viewerUserId)
  {
    if (viewerUserId > 0)
    {
      var followingCount = await _userRepository.GetFollowingCountAsync(viewerUserId);
      if (followingCount > 0)
      {
        var personalized = await _exploreRepository.GetRecommendedProjectsAsync(viewerUserId, RecommendedLimit);
        if (personalized.Count > 0)
          return (await MapProjectsAsync(personalized, viewerUserId), true);
      }
    }

    var recent = await _exploreRepository.GetRecommendedProjectsAsync(0, RecommendedLimit);
    return (await MapProjectsAsync(recent, viewerUserId), false);
  }

  public async Task<IReadOnlyList<ExploreUserDto>> GetSuggestedPeopleAsync(int viewerUserId)
  {
    var users = await _exploreRepository.GetSuggestedUsersAsync(viewerUserId, PeopleLimit);

    var dtos = new List<ExploreUserDto>(users.Count);
    foreach (var user in users)
    {
      var isFollowed = viewerUserId > 0 && await _userRepository.IsFollowingAsync(viewerUserId, user.Id);
      dtos.Add(new ExploreUserDto
      {
        UserId = user.Id,
        Username = user.Username,
        DisplayName = user.DisplayName,
        ProfilePictureUrl = user.ProfilePictureUrl,
        FollowerCount = user.Followers.Count,
        PublicProjectCount = user.Projects.Count(p => p.IsPublic),
        IsFollowedByCurrentUser = isFollowed
      });
    }

    return dtos;
  }

  private async Task<IReadOnlyList<ExploreProjectDto>> MapProjectsAsync(
    IReadOnlyList<Project> projects,
    int viewerUserId)
  {
    HashSet<int> starredIds = new();
    HashSet<int> likedIds = new();
    if (viewerUserId > 0)
    {
      var ids = projects.Select(p => p.Id).ToList();
      starredIds = await GetStarredIdsAsync(viewerUserId, ids);
      likedIds = await _projectRepository.GetLikedProjectIdsAsync(viewerUserId, ids);
    }

    return projects.Select(p => new ExploreProjectDto
    {
      ProjectId = p.Id,
      Name = p.Name,
      Slug = p.Slug,
      ThumbnailDataUrl = _projectAssetStorage.GetThumbnailUrl(p.UserId, p.Id) ?? p.ThumbnailDataUrl,
      LikeCount = p.Likes.Count,
      StarCount = p.Bookmarks.Count,
      ViewCount = p.ViewCount,
      IsLikedByCurrentUser = likedIds.Contains(p.Id),
      IsStarredByCurrentUser = starredIds.Contains(p.Id),
      UpdatedAt = p.UpdatedAt,
      OwnerUserId = p.UserId,
      OwnerUsername = p.User.Username,
      OwnerDisplayName = p.User.DisplayName,
      OwnerProfilePictureUrl = p.User.ProfilePictureUrl
    }).ToList();
  }

  private Task<HashSet<int>> GetStarredIdsAsync(int userId, List<int> projectIds)
  {
    return _projectRepository.GetStarredProjectIdsAsync(userId, projectIds);
  }
}
