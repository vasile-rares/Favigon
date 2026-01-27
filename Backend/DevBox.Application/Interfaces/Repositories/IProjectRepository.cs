using DevBox.Domain.Entities;

namespace DevBox.Application.Interfaces;

public interface IProjectRepository
{
  Task<IReadOnlyList<Project>> GetAllAsync();
  Task<IReadOnlyList<Project>> GetByUserIdAsync(int userId);
  Task<Project?> GetByIdAsync(int id);
  Task<Project> AddAsync(Project project);
  Task UpdateAsync(Project project);
  Task DeleteAsync(Project project);
}
