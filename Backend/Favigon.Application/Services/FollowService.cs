using Favigon.Application.Interfaces;
using Favigon.Domain.Entities;

namespace Favigon.Application.Services;

public class FollowService : IFollowService
{
  private readonly IFollowRepository _followRepository;
  private readonly IUserRepository _userRepository;

  public FollowService(IFollowRepository followRepository, IUserRepository userRepository)
  {
    _followRepository = followRepository;
    _userRepository = userRepository;
  }

  public async Task FollowAsync(int followerId, string followeeUsername)
  {
    var followee = await _userRepository.GetByUsernameAsync(followeeUsername)
      ?? throw new InvalidOperationException("User not found.");

    if (followee.Id == followerId)
      throw new InvalidOperationException("You cannot follow yourself.");

    var existing = await _followRepository.GetAsync(followerId, followee.Id);
    if (existing != null)
      throw new InvalidOperationException("Already following this user.");

    await _followRepository.AddAsync(new UserFollow
    {
      FollowerId = followerId,
      FolloweeId = followee.Id,
      CreatedAt = DateTime.UtcNow
    });
  }

  public async Task UnfollowAsync(int followerId, string followeeUsername)
  {
    var followee = await _userRepository.GetByUsernameAsync(followeeUsername)
      ?? throw new InvalidOperationException("User not found.");

    var follow = await _followRepository.GetAsync(followerId, followee.Id)
      ?? throw new InvalidOperationException("Not following this user.");

    await _followRepository.DeleteAsync(follow);
  }

  public Task<bool> IsFollowingAsync(int followerId, int followeeId)
    => _followRepository.IsFollowingAsync(followerId, followeeId);

  public Task<int> GetFollowerCountAsync(int userId)
    => _followRepository.GetFollowerCountAsync(userId);

  public Task<int> GetFollowingCountAsync(int userId)
    => _followRepository.GetFollowingCountAsync(userId);

  public Task<IReadOnlyList<User>> GetFollowersAsync(int userId)
    => _followRepository.GetFollowersAsync(userId);

  public Task<IReadOnlyList<User>> GetFollowingAsync(int userId)
    => _followRepository.GetFollowingAsync(userId);
}