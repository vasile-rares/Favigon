using DevBox.Application.Interfaces;
using DevBox.Domain.Entities;
using DevBox.Infrastructure.Context;
using Microsoft.EntityFrameworkCore;

namespace DevBox.Infrastructure.Repositories;

public class ProjectRepository : IProjectRepository
{
  private readonly DevBoxDbContext _context;

  public ProjectRepository(DevBoxDbContext context)
  {
    _context = context;
  }

  public async Task<IReadOnlyList<Project>> GetAllAsync()
  {
    return await _context.Projects.AsNoTracking().ToListAsync();
  }

  public async Task<IReadOnlyList<Project>> GetByUserIdAsync(int userId)
  {
    return await _context.Projects
        .AsNoTracking()
        .Where(p => p.UserId == userId)
        .ToListAsync();
  }

  public Task<Project?> GetByIdAsync(int id, int userId)
  {
    return _context.Projects.FirstOrDefaultAsync(p => p.Id == id && p.UserId == userId);
  }

  public Task<bool> ExistsByUserAndRootPathAsync(int userId, string rootPath, int? excludeProjectId = null)
  {
    return _context.Projects.AnyAsync(p =>
      p.UserId == userId &&
      p.RootPath == rootPath &&
      (!excludeProjectId.HasValue || p.Id != excludeProjectId.Value));
  }

  public async Task<Project> AddAsync(Project project)
  {
    _context.Projects.Add(project);
    await _context.SaveChangesAsync();
    return project;
  }

  public async Task UpdateAsync(Project project)
  {
    _context.Projects.Update(project);
    await _context.SaveChangesAsync();
  }

  public async Task DeleteAsync(Project project)
  {
    _context.Projects.Remove(project);
    await _context.SaveChangesAsync();
  }
}
