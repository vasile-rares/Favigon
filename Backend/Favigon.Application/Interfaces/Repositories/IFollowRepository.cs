using Favigon.Domain.Entities;

namespace Favigon.Application.Interfaces;

public interface IFollowRepository
{
  Task<UserFollow?> GetAsync(int followerId, int followeeId);
  Task AddAsync(UserFollow follow);
  Task DeleteAsync(UserFollow follow);
  Task<int> GetFollowerCountAsync(int userId);
  Task<int> GetFollowingCountAsync(int userId);
  Task<bool> IsFollowingAsync(int followerId, int followeeId);
  Task<IReadOnlyList<User>> GetFollowersAsync(int userId);
  Task<IReadOnlyList<User>> GetFollowingAsync(int userId);
}
