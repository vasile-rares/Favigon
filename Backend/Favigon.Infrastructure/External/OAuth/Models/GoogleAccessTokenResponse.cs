using System.Text.Json.Serialization;

namespace Favigon.Infrastructure.External.OAuth.Models;

internal sealed class GoogleAccessTokenResponse
{
  [JsonPropertyName("access_token")]
  public string? AccessToken { get; set; }
}
