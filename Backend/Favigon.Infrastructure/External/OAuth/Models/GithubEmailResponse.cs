using System.Text.Json.Serialization;

namespace Favigon.Infrastructure.External.OAuth.Models;

internal sealed class GithubEmailResponse
{
  [JsonPropertyName("email")]
  public string Email { get; set; } = string.Empty;

  [JsonPropertyName("primary")]
  public bool Primary { get; set; }

  [JsonPropertyName("verified")]
  public bool Verified { get; set; }
}
