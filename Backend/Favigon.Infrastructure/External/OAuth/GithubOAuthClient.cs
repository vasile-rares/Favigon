using System.Net.Http.Headers;
using System.Net.Http.Json;
using Microsoft.Extensions.Configuration;
using Favigon.Application.DTOs.Responses;
using Favigon.Application.Interfaces;
using Favigon.Infrastructure.External.OAuth.Models;

namespace Favigon.Infrastructure.External.OAuth;

public class GithubOAuthClient : IGithubOAuthClient
{
  private readonly HttpClient _httpClient;
  private readonly IConfiguration _configuration;

  public GithubOAuthClient(HttpClient httpClient, IConfiguration configuration)
  {
    _httpClient = httpClient;
    _configuration = configuration;
  }

  public async Task<GithubOAuthProfile> GetUserProfileAsync(string code)
  {
    var clientId = _configuration["GithubOAuth:ClientId"];
    var clientSecret = _configuration["GithubOAuth:ClientSecret"];

    if (string.IsNullOrWhiteSpace(clientId) || string.IsNullOrWhiteSpace(clientSecret))
    {
      throw new InvalidOperationException("GitHub OAuth is not configured on the server.");
    }

    var tokenResponse = await _httpClient.PostAsync(
      "https://github.com/login/oauth/access_token",
      new FormUrlEncodedContent(new Dictionary<string, string>
      {
        ["client_id"] = clientId,
        ["client_secret"] = clientSecret,
        ["code"] = code
      }));

    if (!tokenResponse.IsSuccessStatusCode)
    {
      throw new InvalidOperationException("Could not authenticate with GitHub.");
    }

    var githubToken = await tokenResponse.Content.ReadFromJsonAsync<GithubAccessTokenResponse>();
    if (string.IsNullOrWhiteSpace(githubToken?.AccessToken))
    {
      throw new InvalidOperationException("GitHub token response is invalid.");
    }

    using var userRequest = new HttpRequestMessage(HttpMethod.Get, "https://api.github.com/user");
    userRequest.Headers.Authorization = new AuthenticationHeaderValue("Bearer", githubToken.AccessToken);

    var githubUserResponse = await _httpClient.SendAsync(userRequest);
    if (!githubUserResponse.IsSuccessStatusCode)
    {
      throw new InvalidOperationException("Could not load GitHub user profile.");
    }

    var githubUser = await githubUserResponse.Content.ReadFromJsonAsync<GithubUserResponse>();
    if (githubUser is null)
    {
      throw new InvalidOperationException("GitHub user response is invalid.");
    }

    var email = await ResolveGithubEmailAsync(githubToken.AccessToken, githubUser);

    return new GithubOAuthProfile
    {
      ProviderUserId = githubUser.Id.ToString(),
      Email = email,
      Username = githubUser.Login,
      DisplayName = githubUser.Name,
      ProfilePictureUrl = githubUser.AvatarUrl,
    };
  }

  private async Task<string> ResolveGithubEmailAsync(string accessToken, GithubUserResponse githubUser)
  {
    if (!string.IsNullOrWhiteSpace(githubUser.Email))
    {
      return githubUser.Email;
    }

    using var emailsRequest = new HttpRequestMessage(HttpMethod.Get, "https://api.github.com/user/emails");
    emailsRequest.Headers.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);

    var emailsResponse = await _httpClient.SendAsync(emailsRequest);
    if (!emailsResponse.IsSuccessStatusCode)
    {
      throw new InvalidOperationException("Could not load GitHub account emails.");
    }

    var emails = await emailsResponse.Content.ReadFromJsonAsync<List<GithubEmailResponse>>() ?? [];
    var preferredEmail = emails.FirstOrDefault(email => email.Verified && email.Primary)?.Email
      ?? emails.FirstOrDefault(email => email.Verified)?.Email;

    if (string.IsNullOrWhiteSpace(preferredEmail))
    {
      throw new InvalidOperationException("GitHub account does not have a verified email.");
    }

    return preferredEmail;
  }
}
