using System.ComponentModel.DataAnnotations;
using Prismatic.Domain.IR;

namespace Prismatic.Application.DTOs.Requests;

public class CodeGenRequest
{
    [Required]
    public string Framework { get; set; } = "html";

    public string? Flavor { get; set; }

    [Required]
    public IRNode? Ir { get; set; }
}
