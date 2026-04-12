using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace Favigon.Domain.Entities;

public class User
{
    [Key]
    [DatabaseGenerated(DatabaseGeneratedOption.Identity)]
    public int Id { get; set; }

    [Required, MaxLength(50)]
    public string DisplayName { get; set; } = null!;

    [Required, MaxLength(30)]
    [RegularExpression(@"^[a-z0-9_]+$", ErrorMessage = "Username can only contain lowercase letters, numbers, and underscores")]
    public string Username { get; set; } = null!;

    [Required, MaxLength(100)]
    public string Email { get; set; } = null!;

    [Required, MaxLength(255)]
    public string PasswordHash { get; set; } = null!;

    public bool HasPassword { get; set; } = true;

    [MaxLength(255)]
    public string? ProfilePictureUrl { get; set; }

    [MaxLength(300)]
    public string? Bio { get; set; }

    [MaxLength(20)]
    public string Role { get; set; } = "User";

    [MaxLength(64)]
    public string? PasswordResetTokenHash { get; set; }

    public DateTime? PasswordResetExpiresAt { get; set; }

    public DateTime CreatedAt { get; set; }

    public ICollection<Project> Projects { get; set; } = new List<Project>();

    public ICollection<LinkedAccount> LinkedAccounts { get; set; } = new List<LinkedAccount>();
}
