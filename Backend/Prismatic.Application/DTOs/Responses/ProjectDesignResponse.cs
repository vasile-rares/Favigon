namespace Prismatic.Application.DTOs.Responses;

public class ProjectDesignResponse
{
  public int ProjectId { get; set; }
  public string DesignJson { get; set; } = "{}";
  public DateTime UpdatedAt { get; set; }
}
