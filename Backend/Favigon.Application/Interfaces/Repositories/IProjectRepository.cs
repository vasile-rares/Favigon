using Favigon.Domain.Entities;

namespace Favigon.Application.Interfaces;

public interface IProjectRepository
{
  Task<IReadOnlyList<Project>> GetByUserIdAsync(int userId, bool? isPublic = null);
  Task<Project?> GetByIdAsync(int id, int userId);
  Task<Project?> GetPublicByIdAsync(int id);
  Task<Project?> GetBySlugAsync(string slug, int userId);
  Task<Project?> GetPublicBySlugAsync(string slug);
  Task<bool> SlugExistsForUserAsync(string slug, int userId, int? excludeProjectId = null);
  Task<Project> AddAsync(Project project);
  Task UpdateAsync(Project project);
  Task DeleteAsync(Project project);
  Task IncrementViewCountAsync(int projectId);
  Task<Project?> GetPublicByIdWithDesignAsync(int id);
  Task<Dictionary<int, string>> GetOwnerUsernamesByProjectIdsAsync(IEnumerable<int> projectIds);
}
