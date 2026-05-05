using Favigon.Application.Interfaces;
using Favigon.Domain.Entities;
using Favigon.Infrastructure.Context;
using Microsoft.EntityFrameworkCore;

namespace Favigon.Infrastructure.Repositories;

public class BookmarkRepository : IBookmarkRepository
{
  private readonly FavigonDbContext _context;

  public BookmarkRepository(FavigonDbContext context)
  {
    _context = context;
  }

  public Task<ProjectBookmark?> GetAsync(int userId, int projectId)
  {
    return _context.ProjectBookmarks
      .FirstOrDefaultAsync(b => b.UserId == userId && b.ProjectId == projectId);
  }

  public async Task AddAsync(ProjectBookmark bookmark)
  {
    _context.ProjectBookmarks.Add(bookmark);
    await _context.SaveChangesAsync();
  }

  public async Task DeleteAsync(ProjectBookmark bookmark)
  {
    _context.ProjectBookmarks.Remove(bookmark);
    await _context.SaveChangesAsync();
  }

  public Task<int> GetCountForProjectAsync(int projectId)
  {
    return _context.ProjectBookmarks.CountAsync(b => b.ProjectId == projectId);
  }

  public Task<bool> IsBookmarkedAsync(int userId, int projectId)
  {
    return _context.ProjectBookmarks.AnyAsync(b => b.UserId == userId && b.ProjectId == projectId);
  }

  public async Task<HashSet<int>> GetStarredProjectIdsAsync(int userId, IEnumerable<int> projectIds)
  {
    var ids = projectIds.ToList();
    var starred = await _context.ProjectBookmarks
      .Where(b => b.UserId == userId && ids.Contains(b.ProjectId))
      .Select(b => b.ProjectId)
      .ToListAsync();
    return starred.ToHashSet();
  }

  public async Task<IReadOnlyList<Project>> GetBookmarkedProjectsAsync(int userId)
  {
    return await _context.ProjectBookmarks
      .AsNoTracking()
      .Where(b => b.UserId == userId)
      .OrderByDescending(b => b.CreatedAt)
      .Include(b => b.Project).ThenInclude(p => p.Bookmarks)
      .Include(b => b.Project).ThenInclude(p => p.Likes)
      .Select(b => b.Project)
      .ToListAsync();
  }
}
