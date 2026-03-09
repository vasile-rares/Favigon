using System.Text.Json.Serialization;

namespace Prismatic.Infrastructure.External.OAuth.Models;

internal sealed class GithubAccessTokenResponse
{
  [JsonPropertyName("access_token")]
  public string? AccessToken { get; set; }
}
