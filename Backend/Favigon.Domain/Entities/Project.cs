using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace Favigon.Domain.Entities;

public class Project
{
    [Key]
    [DatabaseGenerated(DatabaseGeneratedOption.Identity)]
    public int Id { get; set; }

    [Required]
    public int UserId { get; set; }

    public User User { get; set; } = null!;

    [Required, MaxLength(100)]
    public string Name { get; set; } = null!;

    [Required, MaxLength(150)]
    public string Slug { get; set; } = null!;

    [Required]
    public string DesignJson { get; set; } = "{}";

    public bool IsPublic { get; set; }

    public string? ThumbnailDataUrl { get; set; }

    public DateTime CreatedAt { get; set; }

    public DateTime UpdatedAt { get; set; }

    public int ViewCount { get; set; }

    public ICollection<ProjectBookmark> Bookmarks { get; set; } = new List<ProjectBookmark>();
}
