using Favigon.Domain.Entities;

namespace Favigon.Application.Interfaces;

public interface IProjectRepository
{
  Task<IReadOnlyList<Project>> GetAllAsync();
  Task<IReadOnlyList<Project>> GetByUserIdAsync(int userId, bool? isPublic = null);
  Task<Project?> GetByIdAsync(int id, int userId);
  Task<Project> AddAsync(Project project);
  Task UpdateAsync(Project project);
  Task DeleteAsync(Project project);
}
