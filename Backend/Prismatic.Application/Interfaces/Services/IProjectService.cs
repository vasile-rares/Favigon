using Prismatic.Application.DTOs.Requests;
using Prismatic.Application.DTOs.Responses;

namespace Prismatic.Application.Interfaces;

public interface IProjectService
{
  Task<IReadOnlyList<ProjectResponse>> GetAllAsync();
  Task<IReadOnlyList<ProjectResponse>> GetByUserIdAsync(int userId);
  Task<ProjectResponse?> GetByIdAsync(int id, int userId);
  Task<ProjectResponse> CreateAsync(ProjectCreateRequest request, int userId);
  Task<ProjectResponse?> UpdateAsync(int id, ProjectUpdateRequest request, int userId);
  Task<bool> DeleteAsync(int id, int userId);
  Task<IReadOnlyList<ProjectFileEntryResponse>?> GetFilesAsync(int projectId, int userId);
  Task<ProjectFileContentResponse?> GetFileContentAsync(int projectId, int userId, string relativePath);
  Task<bool> UpdateFileContentAsync(int projectId, int userId, ProjectFileUpdateRequest request);
}
