using System.Text.Json.Serialization;

namespace Favigon.Infrastructure.External.OAuth.Models;

internal sealed class GoogleUserResponse
{
  [JsonPropertyName("sub")]
  public string? Subject { get; set; }

  [JsonPropertyName("email")]
  public string? Email { get; set; }

  [JsonPropertyName("email_verified")]
  public bool EmailVerified { get; set; }

  [JsonPropertyName("name")]
  public string? Name { get; set; }

  [JsonPropertyName("picture")]
  public string? Picture { get; set; }
}
