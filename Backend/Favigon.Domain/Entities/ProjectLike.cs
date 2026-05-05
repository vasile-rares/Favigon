using System.ComponentModel.DataAnnotations;

namespace Favigon.Domain.Entities;

public class ProjectLike
{
  [Required]
  public int UserId { get; set; }

  public User User { get; set; } = null!;

  [Required]
  public int ProjectId { get; set; }

  public Project Project { get; set; } = null!;

  public DateTime CreatedAt { get; set; }
}
