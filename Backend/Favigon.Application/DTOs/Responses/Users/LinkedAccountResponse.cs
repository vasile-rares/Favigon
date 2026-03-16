namespace Favigon.Application.DTOs.Responses;

public class LinkedAccountResponse
{
  public string Provider { get; set; } = string.Empty;
  public string ProviderEmail { get; set; } = string.Empty;
  public DateTime CreatedAt { get; set; }
}
