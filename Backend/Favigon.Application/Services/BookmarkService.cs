using AutoMapper;
using Favigon.Application.DTOs.Responses;
using Favigon.Application.Interfaces;
using Favigon.Domain.Entities;

namespace Favigon.Application.Services;

public class BookmarkService : IBookmarkService
{
  private readonly IBookmarkRepository _bookmarkRepository;
  private readonly IProjectRepository _projectRepository;
  private readonly IProjectAssetStorage _projectAssetStorage;
  private readonly IMapper _mapper;

  public BookmarkService(
    IBookmarkRepository bookmarkRepository,
    IProjectRepository projectRepository,
    IProjectAssetStorage projectAssetStorage,
    IMapper mapper)
  {
    _bookmarkRepository = bookmarkRepository;
    _projectRepository = projectRepository;
    _projectAssetStorage = projectAssetStorage;
    _mapper = mapper;
  }

  public async Task BookmarkAsync(int userId, int projectId)
  {
    var project = await _projectRepository.GetPublicByIdAsync(projectId);
    if (project == null)
    {
      // Allow owner to bookmark their own private project
      project = await _projectRepository.GetByIdAsync(projectId, userId);
    }

    if (project == null)
      throw new InvalidOperationException("Project not found or not accessible.");

    var existing = await _bookmarkRepository.GetAsync(userId, projectId);
    if (existing != null)
      throw new InvalidOperationException("Project is already starred.");

    await _bookmarkRepository.AddAsync(new ProjectBookmark
    {
      UserId = userId,
      ProjectId = projectId,
      CreatedAt = DateTime.UtcNow
    });
  }

  public async Task UnbookmarkAsync(int userId, int projectId)
  {
    var bookmark = await _bookmarkRepository.GetAsync(userId, projectId)
      ?? throw new InvalidOperationException("Project is not starred.");

    await _bookmarkRepository.DeleteAsync(bookmark);
  }

  public async Task<IReadOnlyList<ProjectResponse>> GetMyBookmarksAsync(int userId)
  {
    var projects = await _bookmarkRepository.GetBookmarkedProjectsAsync(userId);

    var responses = new List<ProjectResponse>(projects.Count);
    foreach (var project in projects)
    {
      var response = _mapper.Map<ProjectResponse>(project);
      response.ThumbnailDataUrl =
        _projectAssetStorage.GetThumbnailUrl(project.UserId, project.Id) ??
        project.ThumbnailDataUrl;
      response.StarCount = await _bookmarkRepository.GetCountForProjectAsync(project.Id);
      response.IsStarredByCurrentUser = true;
      responses.Add(response);
    }

    return responses;
  }
}
