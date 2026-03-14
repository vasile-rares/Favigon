using System.Text.Json.Serialization;

namespace Favigon.Infrastructure.External.OAuth.Models;

internal sealed class GithubUserResponse
{
  [JsonPropertyName("id")]
  public long Id { get; set; }

  [JsonPropertyName("login")]
  public string? Login { get; set; }

  [JsonPropertyName("name")]
  public string? Name { get; set; }

  [JsonPropertyName("email")]
  public string? Email { get; set; }

  [JsonPropertyName("avatar_url")]
  public string? AvatarUrl { get; set; }
}
