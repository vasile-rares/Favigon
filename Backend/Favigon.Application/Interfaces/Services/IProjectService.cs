using Favigon.Application.DTOs.Requests;
using Favigon.Application.DTOs.Responses;

namespace Favigon.Application.Interfaces;

public interface IProjectService
{
  Task<IReadOnlyList<ProjectResponse>> GetByUserIdAsync(int userId, bool? isPublic = null, int? viewerUserId = null);
  Task<ProjectResponse?> GetByIdAsync(int id, int userId);
  Task<ProjectResponse?> GetBySlugAsync(string slug, int userId);
  Task<ProjectResponse> CreateAsync(ProjectCreateRequest request, int userId);
  Task<ProjectResponse?> UpdateAsync(int id, ProjectUpdateRequest request, int userId);
  Task<bool> DeleteAsync(int id, int userId, CancellationToken cancellationToken = default);
  Task<ProjectDesignResponse?> GetDesignByProjectIdAsync(int projectId, int userId);
  Task<ProjectDesignResponse?> SaveDesignAsync(int projectId, int userId, ProjectDesignSaveRequest request);
  Task<bool> SaveThumbnailAsync(
    int projectId,
    int userId,
    ProjectImageUploadRequest request,
    CancellationToken cancellationToken = default);
  Task<ProjectResponse?> ForkAsync(int sourceProjectId, int userId);
}
