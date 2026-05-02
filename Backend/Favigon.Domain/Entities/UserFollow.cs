using System.ComponentModel.DataAnnotations;

namespace Favigon.Domain.Entities;

public class UserFollow
{
  [Required]
  public int FollowerId { get; set; }

  public User Follower { get; set; } = null!;

  [Required]
  public int FolloweeId { get; set; }

  public User Followee { get; set; } = null!;

  public DateTime CreatedAt { get; set; }
}
