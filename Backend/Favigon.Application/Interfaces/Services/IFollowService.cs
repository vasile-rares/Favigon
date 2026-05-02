using Favigon.Domain.Entities;

namespace Favigon.Application.Interfaces;

public interface IFollowService
{
  Task FollowAsync(int followerId, string followeeUsername);
  Task UnfollowAsync(int followerId, string followeeUsername);
  Task<bool> IsFollowingAsync(int followerId, int followeeId);
  Task<int> GetFollowerCountAsync(int userId);
  Task<int> GetFollowingCountAsync(int userId);
  Task<IReadOnlyList<User>> GetFollowersAsync(int userId);
  Task<IReadOnlyList<User>> GetFollowingAsync(int userId);
}
