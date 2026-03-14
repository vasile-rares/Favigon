using System.Text.Json.Serialization;

namespace Favigon.Infrastructure.External.OAuth.Models;

internal sealed class GithubAccessTokenResponse
{
  [JsonPropertyName("access_token")]
  public string? AccessToken { get; set; }
}
