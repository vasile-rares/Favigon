using Favigon.Application.Interfaces;
using Favigon.Domain.Entities;
using Favigon.Infrastructure.Context;
using Microsoft.EntityFrameworkCore;

namespace Favigon.Infrastructure.Repositories;

public class FollowRepository : IFollowRepository
{
  private readonly FavigonDbContext _context;

  public FollowRepository(FavigonDbContext context)
  {
    _context = context;
  }

  public Task<UserFollow?> GetAsync(int followerId, int followeeId)
  {
    return _context.UserFollows
      .FirstOrDefaultAsync(f => f.FollowerId == followerId && f.FolloweeId == followeeId);
  }

  public async Task AddAsync(UserFollow follow)
  {
    _context.UserFollows.Add(follow);
    await _context.SaveChangesAsync();
  }

  public async Task DeleteAsync(UserFollow follow)
  {
    _context.UserFollows.Remove(follow);
    await _context.SaveChangesAsync();
  }

  public Task<int> GetFollowerCountAsync(int userId)
  {
    return _context.UserFollows.CountAsync(f => f.FolloweeId == userId);
  }

  public Task<int> GetFollowingCountAsync(int userId)
  {
    return _context.UserFollows.CountAsync(f => f.FollowerId == userId);
  }

  public Task<bool> IsFollowingAsync(int followerId, int followeeId)
  {
    return _context.UserFollows.AnyAsync(f => f.FollowerId == followerId && f.FolloweeId == followeeId);
  }

  public async Task<IReadOnlyList<User>> GetFollowersAsync(int userId)
  {
    return await _context.UserFollows
      .Where(f => f.FolloweeId == userId)
      .OrderByDescending(f => f.CreatedAt)
      .Select(f => f.Follower)
      .ToListAsync();
  }

  public async Task<IReadOnlyList<User>> GetFollowingAsync(int userId)
  {
    return await _context.UserFollows
      .Where(f => f.FollowerId == userId)
      .OrderByDescending(f => f.CreatedAt)
      .Select(f => f.Followee)
      .ToListAsync();
  }
}
