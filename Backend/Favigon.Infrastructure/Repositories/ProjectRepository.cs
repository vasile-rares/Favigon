using Favigon.Application.Interfaces;
using Favigon.Domain.Entities;
using Favigon.Infrastructure.Context;
using Microsoft.EntityFrameworkCore;

namespace Favigon.Infrastructure.Repositories;

public class ProjectRepository : IProjectRepository
{
  private readonly FavigonDbContext _context;

  public ProjectRepository(FavigonDbContext context)
  {
    _context = context;
  }

  public async Task<IReadOnlyList<Project>> GetByUserIdAsync(int userId, bool? isPublic = null)
  {
    return await _context.Projects
        .AsNoTracking()
        .Where(p => p.UserId == userId && (isPublic == null || p.IsPublic == isPublic))
        .ToListAsync();
  }

  public Task<Project?> GetByIdAsync(int id, int userId)
  {
    return _context.Projects.FirstOrDefaultAsync(p => p.Id == id && p.UserId == userId);
  }

  public Task<Project?> GetPublicByIdAsync(int id)
  {
    return _context.Projects.FirstOrDefaultAsync(p => p.Id == id && p.IsPublic);
  }

  public Task<Project?> GetBySlugAsync(string slug, int userId)
  {
    return _context.Projects.FirstOrDefaultAsync(p => p.Slug == slug && p.UserId == userId);
  }

  public Task<bool> SlugExistsForUserAsync(string slug, int userId, int? excludeProjectId = null)
  {
    return _context.Projects.AnyAsync(p =>
      p.Slug == slug && p.UserId == userId && (excludeProjectId == null || p.Id != excludeProjectId));
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
