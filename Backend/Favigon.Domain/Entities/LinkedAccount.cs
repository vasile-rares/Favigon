using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace Favigon.Domain.Entities;

public class LinkedAccount
{
    [Key]
    [DatabaseGenerated(DatabaseGeneratedOption.Identity)]
    public int Id { get; set; }

    [Required]
    public int UserId { get; set; }

    public User User { get; set; } = null!;

    [Required, MaxLength(50)]
    public string Provider { get; set; } = null!;

    [Required, MaxLength(255)]
    public string ProviderUserId { get; set; } = null!;

    [Required, MaxLength(100)]
    public string ProviderEmail { get; set; } = null!;

    public DateTime CreatedAt { get; set; }
}