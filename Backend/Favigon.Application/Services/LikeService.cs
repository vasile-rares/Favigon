using Favigon.Application.Interfaces;
using Favigon.Domain.Entities;

namespace Favigon.Application.Services;

public class LikeService : ILikeService
{
  private readonly ILikeRepository _likeRepository;
  private readonly IProjectRepository _projectRepository;

  public LikeService(ILikeRepository likeRepository, IProjectRepository projectRepository)
  {
    _likeRepository = likeRepository;
    _projectRepository = projectRepository;
  }

  public async Task LikeAsync(int userId, int projectId)
  {
    var project = await _projectRepository.GetPublicByIdAsync(projectId);
    if (project == null)
    {
      // Allow owner to like their own private project
      project = await _projectRepository.GetByIdAsync(projectId, userId);
    }

    if (project == null)
      throw new InvalidOperationException("Project not found or not accessible.");

    var existing = await _likeRepository.GetAsync(userId, projectId);
    if (existing != null)
      throw new InvalidOperationException("Project is already liked.");

    await _likeRepository.AddAsync(new ProjectLike
    {
      UserId = userId,
      ProjectId = projectId,
      CreatedAt = DateTime.UtcNow
    });
  }

  public async Task UnlikeAsync(int userId, int projectId)
  {
    var like = await _likeRepository.GetAsync(userId, projectId)
        ?? throw new InvalidOperationException("Project is not liked.");

    await _likeRepository.DeleteAsync(like);
  }
}
