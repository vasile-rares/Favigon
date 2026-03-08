using System.IdentityModel.Tokens.Jwt;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Security.Claims;
using System.Text;
using System.Text.Json.Serialization;
using Prismatic.Application.DTOs.Requests;
using Prismatic.Application.DTOs.Responses;
using Prismatic.Application.Interfaces;
using Prismatic.Domain.Entities;
using Microsoft.Extensions.Configuration;
using Microsoft.IdentityModel.Tokens;

namespace Prismatic.Application.Services;

public class AuthService : IAuthService
{
  private readonly IUserRepository _userRepository;
  private readonly IAccountProviderRepository _accountProviderRepository;
  private readonly IConfiguration _configuration;

  public AuthService(
      IUserRepository userRepository,
      IAccountProviderRepository accountProviderRepository,
      IConfiguration configuration)
  {
    _userRepository = userRepository;
    _accountProviderRepository = accountProviderRepository;
    _configuration = configuration;
  }

  public async Task<AuthResponse> RegisterAsync(RegisterRequest request)
  {
    request.Username = request.Username.Trim().ToLowerInvariant();
    request.DisplayName = request.DisplayName.Trim();
    request.Email = request.Email.Trim();

    var existingByUsername = await _userRepository.GetByUsernameAsync(request.Username);
    if (existingByUsername != null)
    {
      throw new InvalidOperationException("Username already exists.");
    }

    var existingByEmail = await _userRepository.GetByEmailAsync(request.Email);
    if (existingByEmail != null)
    {
      throw new InvalidOperationException("Email already exists.");
    }

    var user = new User
    {
      Username = request.Username,
      DisplayName = request.DisplayName,
      Email = request.Email,
      PasswordHash = BCrypt.Net.BCrypt.HashPassword(request.Password),
      ProfilePictureUrl = request.ProfilePictureUrl,
      Role = "User"
    };

    await _userRepository.AddAsync(user);

    var (token, expiresAt) = GenerateJwtToken(user);

    return new AuthResponse
    {
      UserId = user.Id,
      DisplayName = user.DisplayName,
      Username = user.Username,
      Email = user.Email,
      ProfilePictureUrl = user.ProfilePictureUrl,
      Role = user.Role,
      Token = token,
      ExpiresAt = expiresAt
    };
  }

  public async Task<AuthResponse?> LoginAsync(LoginRequest request)
  {
    var email = request.Email.Trim();
    var user = await _userRepository.GetByEmailAsync(email);

    if (user is null)
    {
      return null;
    }

    if (!BCrypt.Net.BCrypt.Verify(request.Password, user.PasswordHash))
    {
      return null;
    }

    var (token, expiresAt) = GenerateJwtToken(user);

    return CreateAuthResponse(user, token, expiresAt);
  }

  public async Task<AuthResponse> LoginWithGithubAsync(GithubAuthRequest request)
  {
    var code = request.Code?.Trim();
    if (string.IsNullOrWhiteSpace(code))
    {
      throw new ArgumentException("GitHub authorization code is required.");
    }

    var clientId = _configuration["GithubOAuth:ClientId"];
    var clientSecret = _configuration["GithubOAuth:ClientSecret"];

    if (string.IsNullOrWhiteSpace(clientId) || string.IsNullOrWhiteSpace(clientSecret))
    {
      throw new InvalidOperationException("GitHub OAuth is not configured on the server.");
    }

    using var httpClient = new HttpClient();
    httpClient.DefaultRequestHeaders.UserAgent.Add(new ProductInfoHeaderValue("Prismatic", "1.0"));
    httpClient.DefaultRequestHeaders.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));

    var tokenResponse = await httpClient.PostAsync(
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

    var githubUserResponse = await httpClient.SendAsync(userRequest);
    if (!githubUserResponse.IsSuccessStatusCode)
    {
      throw new InvalidOperationException("Could not load GitHub user profile.");
    }

    var githubUser = await githubUserResponse.Content.ReadFromJsonAsync<GithubUserResponse>();
    if (githubUser is null)
    {
      throw new InvalidOperationException("GitHub user response is invalid.");
    }

    var email = await ResolveGithubEmailAsync(httpClient, githubToken.AccessToken, githubUser);
    var normalizedEmail = email.Trim().ToLowerInvariant();

    var user = await ResolveOrCreateExternalUserAsync(
      "github",
      githubUser.Id.ToString(),
      normalizedEmail,
      BuildUsernameCandidate(githubUser.Login, normalizedEmail, "github_user"),
      githubUser.Name,
      githubUser.AvatarUrl);

    var (token, expiresAt) = GenerateJwtToken(user);
    return CreateAuthResponse(user, token, expiresAt);
  }

  public async Task<AuthResponse> LoginWithGoogleAsync(GoogleAuthRequest request)
  {
    var code = request.Code?.Trim();
    if (string.IsNullOrWhiteSpace(code))
    {
      throw new ArgumentException("Google authorization code is required.");
    }

    var clientId = _configuration["GoogleOAuth:ClientId"];
    var clientSecret = _configuration["GoogleOAuth:ClientSecret"];
    var redirectUri = _configuration["GoogleOAuth:RedirectUri"];

    if (string.IsNullOrWhiteSpace(clientId) ||
        string.IsNullOrWhiteSpace(clientSecret) ||
        string.IsNullOrWhiteSpace(redirectUri))
    {
      throw new InvalidOperationException("Google OAuth is not configured on the server.");
    }

    using var httpClient = new HttpClient();

    var tokenResponse = await httpClient.PostAsync(
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

    using var userRequest = new HttpRequestMessage(
      HttpMethod.Get,
      "https://openidconnect.googleapis.com/v1/userinfo");
    userRequest.Headers.Authorization = new AuthenticationHeaderValue("Bearer", googleToken.AccessToken);

    var googleUserResponse = await httpClient.SendAsync(userRequest);
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

    var normalizedEmail = googleUser.Email.Trim().ToLowerInvariant();
    var user = await ResolveOrCreateExternalUserAsync(
      "google",
      googleUser.Subject,
      normalizedEmail,
      BuildUsernameCandidate(googleUser.Name, normalizedEmail, "google_user"),
      googleUser.Name,
      googleUser.Picture);

    var (token, expiresAt) = GenerateJwtToken(user);
    return CreateAuthResponse(user, token, expiresAt);
  }

  private async Task<string> ResolveGithubEmailAsync(HttpClient httpClient, string accessToken, GithubUserResponse githubUser)
  {
    if (!string.IsNullOrWhiteSpace(githubUser.Email))
    {
      return githubUser.Email;
    }

    using var emailsRequest = new HttpRequestMessage(HttpMethod.Get, "https://api.github.com/user/emails");
    emailsRequest.Headers.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);

    var emailsResponse = await httpClient.SendAsync(emailsRequest);
    if (!emailsResponse.IsSuccessStatusCode)
    {
      throw new InvalidOperationException("Could not load GitHub account emails.");
    }

    var emails = await emailsResponse.Content.ReadFromJsonAsync<List<GithubEmailResponse>>() ?? [];
    var preferredEmail = emails.FirstOrDefault(e => e.Verified && e.Primary)?.Email
      ?? emails.FirstOrDefault(e => e.Verified)?.Email;

    if (string.IsNullOrWhiteSpace(preferredEmail))
    {
      throw new InvalidOperationException("GitHub account does not have a verified email.");
    }

    return preferredEmail;
  }

  private async Task<string> GenerateUniqueUsernameAsync(string candidate)
  {
    var baseUsername = candidate;
    var suffix = 0;

    while (await _userRepository.GetByUsernameAsync(candidate) is not null)
    {
      suffix++;
      candidate = $"{baseUsername}{suffix}";
    }

    return candidate;
  }

  private async Task<User> ResolveOrCreateExternalUserAsync(
    string provider,
    string providerUserId,
    string normalizedEmail,
    string usernameCandidate,
    string? displayNameCandidate,
    string? profilePictureUrl)
  {
    var existingProvider = await _accountProviderRepository.GetByProviderAsync(provider, providerUserId);
    if (existingProvider?.User is not null)
    {
      var linkedUser = existingProvider.User;

      if (!string.Equals(existingProvider.ProviderEmail, normalizedEmail, StringComparison.OrdinalIgnoreCase))
      {
        existingProvider.ProviderEmail = normalizedEmail;
        await _accountProviderRepository.UpdateAsync(existingProvider);
      }

      return linkedUser;
    }

    var user = await _userRepository.GetByEmailAsync(normalizedEmail);
    if (user is null)
    {
      var username = await GenerateUniqueUsernameAsync(usernameCandidate);
      var displayName = string.IsNullOrWhiteSpace(displayNameCandidate)
        ? username
        : displayNameCandidate.Trim();

      user = new User
      {
        Username = username,
        DisplayName = displayName,
        Email = normalizedEmail,
        PasswordHash = BCrypt.Net.BCrypt.HashPassword(Guid.NewGuid().ToString("N")),
        ProfilePictureUrl = profilePictureUrl,
        Role = "User"
      };

      await _userRepository.AddAsync(user);
    }

    var providerRecord = await _accountProviderRepository.GetByUserIdAndProviderAsync(user.Id, provider);
    if (providerRecord is null)
    {
      await _accountProviderRepository.AddAsync(new AccountProvider
      {
        UserId = user.Id,
        Provider = provider,
        ProviderUserId = providerUserId,
        ProviderEmail = normalizedEmail,
      });
    }
    else if (!string.Equals(providerRecord.ProviderUserId, providerUserId, StringComparison.Ordinal) ||
             !string.Equals(providerRecord.ProviderEmail, normalizedEmail, StringComparison.OrdinalIgnoreCase))
    {
      providerRecord.ProviderUserId = providerUserId;
      providerRecord.ProviderEmail = normalizedEmail;
      await _accountProviderRepository.UpdateAsync(providerRecord);
    }

    return user;
  }

  private static string BuildUsernameCandidate(string? rawCandidate, string email, string fallbackPrefix)
  {
    var raw = string.IsNullOrWhiteSpace(rawCandidate)
      ? email.Split('@')[0]
      : rawCandidate;

    var cleaned = new string(raw
      .Trim()
      .ToLowerInvariant()
      .Select(ch => char.IsLetterOrDigit(ch) || ch == '_' ? ch : '_')
      .ToArray());

    if (string.IsNullOrWhiteSpace(cleaned))
    {
      cleaned = fallbackPrefix;
    }

    return cleaned.Length <= 30 ? cleaned : cleaned[..30];
  }

  private static AuthResponse CreateAuthResponse(User user, string token, DateTime expiresAt)
  {
    return new AuthResponse
    {
      UserId = user.Id,
      DisplayName = user.DisplayName,
      Username = user.Username,
      Email = user.Email,
      ProfilePictureUrl = user.ProfilePictureUrl,
      Role = user.Role,
      Token = token,
      ExpiresAt = expiresAt
    };
  }

  private sealed class GithubAccessTokenResponse
  {
    [JsonPropertyName("access_token")]
    public string? AccessToken { get; set; }
  }

  private sealed class GithubUserResponse
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

  private sealed class GithubEmailResponse
  {
    [JsonPropertyName("email")]
    public string Email { get; set; } = string.Empty;

    [JsonPropertyName("primary")]
    public bool Primary { get; set; }

    [JsonPropertyName("verified")]
    public bool Verified { get; set; }
  }

  private sealed class GoogleAccessTokenResponse
  {
    [JsonPropertyName("access_token")]
    public string? AccessToken { get; set; }
  }

  private sealed class GoogleUserResponse
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

  private (string Token, DateTime ExpiresAt) GenerateJwtToken(User user)
  {
    var key = _configuration["JwtSettings:Key"] ?? "";
    var issuer = _configuration["JwtSettings:Issuer"];
    var audience = _configuration["JwtSettings:Audience"];
    var expirationMinutes = _configuration.GetValue<int>("JwtSettings:AccessTokenMinutes");
    var expiresAt = DateTime.UtcNow.AddMinutes(expirationMinutes);

    var claims = new[]
    {
      new Claim(ClaimTypes.NameIdentifier, user.Id.ToString()),
      new Claim(JwtRegisteredClaimNames.Email, user.Email),
      new Claim(ClaimTypes.Name, user.DisplayName),
      new Claim(ClaimTypes.Role, user.Role),
      new Claim("username", user.Username),
      new Claim(JwtRegisteredClaimNames.Jti, Guid.NewGuid().ToString())
    };

    var signingKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(key));
    var credentials = new SigningCredentials(signingKey, SecurityAlgorithms.HmacSha256);

    var token = new JwtSecurityToken(
        issuer: issuer,
        audience: audience,
        claims: claims,
        expires: expiresAt,
        signingCredentials: credentials);

    return (new JwtSecurityTokenHandler().WriteToken(token), expiresAt);
  }
}
