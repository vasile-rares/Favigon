using System.Net.Http.Headers;
using System.Net.Http.Json;
using Microsoft.Extensions.Configuration;
using Prismatic.Application.DTOs.Responses;
using Prismatic.Application.Interfaces;
using Prismatic.Infrastructure.External.OAuth.Models;

namespace Prismatic.Infrastructure.External.OAuth;

public class GoogleOAuthClient : IGoogleOAuthClient
{
  private readonly HttpClient _httpClient;
  private readonly IConfiguration _configuration;

  public GoogleOAuthClient(HttpClient httpClient, IConfiguration configuration)
  {
    _httpClient = httpClient;
    _configuration = configuration;
  }

  public async Task<GoogleOAuthProfile> GetUserProfileAsync(string code)
  {
    var clientId = _configuration["GoogleOAuth:ClientId"];
    var clientSecret = _configuration["GoogleOAuth:ClientSecret"];
    var redirectUri = _configuration["GoogleOAuth:RedirectUri"];

    if (string.IsNullOrWhiteSpace(clientId) ||
        string.IsNullOrWhiteSpace(clientSecret) ||
        string.IsNullOrWhiteSpace(redirectUri))
    {
      throw new InvalidOperationException("Google OAuth is not configured on the server.");
    }

    var tokenResponse = await _httpClient.PostAsync(
      "https://oauth2.googleapis.com/token",
      new FormUrlEncodedContent(new Dictionary<string, string>
      {
        ["client_id"] = clientId,
        ["client_secret"] = clientSecret,
        ["code"] = code,
        ["grant_type"] = "authorization_code",
        ["redirect_uri"] = redirectUri
      }));

    if (!tokenResponse.IsSuccessStatusCode)
    {
      throw new InvalidOperationException("Could not authenticate with Google.");
    }

    var googleToken = await tokenResponse.Content.ReadFromJsonAsync<GoogleAccessTokenResponse>();
    if (string.IsNullOrWhiteSpace(googleToken?.AccessToken))
    {
      throw new InvalidOperationException("Google token response is invalid.");
    }

    using var userRequest = new HttpRequestMessage(HttpMethod.Get, "https://openidconnect.googleapis.com/v1/userinfo");
    userRequest.Headers.Authorization = new AuthenticationHeaderValue("Bearer", googleToken.AccessToken);

    var googleUserResponse = await _httpClient.SendAsync(userRequest);
    if (!googleUserResponse.IsSuccessStatusCode)
    {
      throw new InvalidOperationException("Could not load Google user profile.");
    }

    var googleUser = await googleUserResponse.Content.ReadFromJsonAsync<GoogleUserResponse>();
    if (googleUser is null || string.IsNullOrWhiteSpace(googleUser.Email) || string.IsNullOrWhiteSpace(googleUser.Subject))
    {
      throw new InvalidOperationException("Google user response is invalid.");
    }

    if (!googleUser.EmailVerified)
    {
      throw new InvalidOperationException("Google account email is not verified.");
    }

    return new GoogleOAuthProfile
    {
      ProviderUserId = googleUser.Subject,
      Email = googleUser.Email,
      DisplayName = googleUser.Name,
      ProfilePictureUrl = googleUser.Picture,
    };
  }
}
