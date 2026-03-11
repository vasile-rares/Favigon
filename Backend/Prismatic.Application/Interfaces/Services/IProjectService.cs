using Prismatic.Application.DTOs.Requests;
using Prismatic.Application.DTOs.Responses;

namespace Prismatic.Application.Interfaces;

public interface IProjectService
{
  Task<IReadOnlyList<ProjectResponse>> GetAllAsync();
  Task<IReadOnlyList<ProjectResponse>> GetByUserIdAsync(int userId, bool? isPublic = null);
  Task<ProjectResponse?> GetByIdAsync(int id, int userId);
  Task<ProjectResponse> CreateAsync(ProjectCreateRequest request, int userId);
  Task<ProjectResponse?> UpdateAsync(int id, ProjectUpdateRequest request, int userId);
  Task<bool> DeleteAsync(int id, int userId);
  Task<ProjectDesignResponse?> GetDesignByProjectIdAsync(int projectId, int userId);
  Task<ProjectDesignResponse?> SaveDesignAsync(int projectId, int userId, ProjectDesignSaveRequest request);
}
