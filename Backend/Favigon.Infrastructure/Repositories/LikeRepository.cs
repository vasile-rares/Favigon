using Favigon.Application.Interfaces;
using Favigon.Domain.Entities;
using Favigon.Infrastructure.Context;
using Microsoft.EntityFrameworkCore;

namespace Favigon.Infrastructure.Repositories;

public class LikeRepository : ILikeRepository
{
  private readonly FavigonDbContext _context;

  public LikeRepository(FavigonDbContext context)
  {
    _context = context;
  }

  public Task<ProjectLike?> GetAsync(int userId, int projectId)
  {
    return _context.ProjectLikes
        .FirstOrDefaultAsync(l => l.UserId == userId && l.ProjectId == projectId);
  }

  public async Task AddAsync(ProjectLike like)
  {
    _context.ProjectLikes.Add(like);
    await _context.SaveChangesAsync();
  }

  public async Task DeleteAsync(ProjectLike like)
  {
    _context.ProjectLikes.Remove(like);
    await _context.SaveChangesAsync();
  }

  public Task<int> GetCountForProjectAsync(int projectId)
  {
    return _context.ProjectLikes.CountAsync(l => l.ProjectId == projectId);
  }

  public Task<bool> IsLikedAsync(int userId, int projectId)
  {
    return _context.ProjectLikes.AnyAsync(l => l.UserId == userId && l.ProjectId == projectId);
  }

  public async Task<HashSet<int>> GetLikedProjectIdsAsync(int userId, IEnumerable<int> projectIds)
  {
    var ids = projectIds.ToList();
    var liked = await _context.ProjectLikes
        .Where(l => l.UserId == userId && ids.Contains(l.ProjectId))
        .Select(l => l.ProjectId)
        .ToListAsync();
    return liked.ToHashSet();
  }
}
