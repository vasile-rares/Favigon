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
        .Include(p => p.Bookmarks)
        .Include(p => p.Likes)
        .Include(p => p.ForkedFromProject)
            .ThenInclude(fp => fp!.User)
        .ToListAsync();
  }

  public Task<Project?> GetByIdAsync(int id, int userId)
  {
    return _context.Projects
      .Include(p => p.ForkedFromProject)
          .ThenInclude(fp => fp!.User)
      .FirstOrDefaultAsync(p => p.Id == id && p.UserId == userId);
  }

  public Task<Project?> GetPublicByIdAsync(int id)
  {
    return _context.Projects.FirstOrDefaultAsync(p => p.Id == id && p.IsPublic);
  }

  public Task<Project?> GetBySlugAsync(string slug, int userId)
  {
    return _context.Projects.FirstOrDefaultAsync(p => p.Slug == slug && p.UserId == userId);
  }

  public Task<Project?> GetPublicBySlugAsync(string slug)
  {
    return _context.Projects.FirstOrDefaultAsync(p => p.Slug == slug && p.IsPublic);
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

  public Task IncrementViewCountAsync(int projectId)
  {
    return _context.Projects
      .Where(p => p.Id == projectId && p.IsPublic)
      .ExecuteUpdateAsync(s => s.SetProperty(p => p.ViewCount, p => p.ViewCount + 1));
  }

  public Task<Project?> GetPublicByIdWithDesignAsync(int id)
  {
    return _context.Projects
      .AsNoTracking()
      .FirstOrDefaultAsync(p => p.Id == id && p.IsPublic);
  }

  public async Task<Dictionary<int, string>> GetOwnerUsernamesByProjectIdsAsync(IEnumerable<int> projectIds)
  {
    var ids = projectIds.ToList();
    return await _context.Projects
      .AsNoTracking()
      .Where(p => ids.Contains(p.Id))
      .Join(_context.Users,
            p => p.UserId,
            u => u.Id,
            (p, u) => new { p.Id, u.Username })
      .ToDictionaryAsync(x => x.Id, x => x.Username);
  }
}
