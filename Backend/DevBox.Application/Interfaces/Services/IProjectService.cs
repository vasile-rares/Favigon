using DevBox.Application.DTOs.Requests;
using DevBox.Application.DTOs.Responses;

namespace DevBox.Application.Interfaces;

public interface IProjectService
{
  Task<IReadOnlyList<ProjectResponse>> GetAllAsync();
  Task<IReadOnlyList<ProjectResponse>> GetByUserIdAsync(int userId);
  Task<ProjectResponse?> GetByIdAsync(int id);
  Task<ProjectResponse> CreateAsync(ProjectCreateRequest request, int userId);
  Task<ProjectResponse?> UpdateAsync(int id, ProjectUpdateRequest request);
  Task<bool> DeleteAsync(int id);
}
