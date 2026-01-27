using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace DevBox.Domain.Entities;

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

    [Required, MaxLength(20)]
    [RegularExpression("^(Vanilla|React|Angular)$", ErrorMessage = "Type must be Vanilla, React, or Angular")]
    public string Type { get; set; } = null!;

    [Required, MaxLength(260)]
    public string RootPath { get; set; } = null!;

    public bool IsPublic { get; set; }

    public DateTime CreatedAt { get; set; }

    public DateTime UpdatedAt { get; set; }
}
