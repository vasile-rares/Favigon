using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using Favigon.Application.DTOs.Requests;
using Favigon.Application.Helpers;
using Favigon.Application.DTOs.Responses;
using Favigon.Application.Interfaces;
using Favigon.Domain.Entities;
using AutoMapper;
using Microsoft.Extensions.Configuration;
using Microsoft.IdentityModel.Tokens;

namespace Favigon.Application.Services;

public class AuthService : IAuthService
{
  private readonly IUserRepository _userRepository;
  private readonly ILinkedAccountRepository _linkedAccountRepository;
  private readonly IGithubOAuthClient _githubOAuthClient;
  private readonly IGoogleOAuthClient _googleOAuthClient;
  private readonly IEmailSender _emailSender;
  private readonly IMapper _mapper;
  private readonly IConfiguration _configuration;

  public AuthService(
      IUserRepository userRepository,
      ILinkedAccountRepository linkedAccountRepository,
      IGithubOAuthClient githubOAuthClient,
      IGoogleOAuthClient googleOAuthClient,
      IEmailSender emailSender,
      IMapper mapper,
      IConfiguration configuration)
  {
    _userRepository = userRepository;
    _linkedAccountRepository = linkedAccountRepository;
    _githubOAuthClient = githubOAuthClient;
    _googleOAuthClient = googleOAuthClient;
    _emailSender = emailSender;
    _mapper = mapper;
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
    var (refreshToken, _) = GenerateRefreshToken(user);
    var response = _mapper.Map<AuthResponse>(user);
    response.Token = token;
    response.ExpiresAt = expiresAt;
    response.RefreshToken = refreshToken;
    return response;
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
    var (refreshToken, _) = GenerateRefreshToken(user);
    var response = _mapper.Map<AuthResponse>(user);
    response.Token = token;
    response.ExpiresAt = expiresAt;
    response.RefreshToken = refreshToken;
    return response;
  }

  public async Task<AuthResponse> LoginWithGithubAsync(GithubAuthRequest request)
  {
    var code = request.Code?.Trim();
    if (string.IsNullOrWhiteSpace(code))
    {
      throw new ArgumentException("GitHub authorization code is required.");
    }

    var githubProfile = await _githubOAuthClient.GetUserProfileAsync(code);
    var normalizedEmail = githubProfile.Email.Trim().ToLowerInvariant();

    var user = await FindOrCreateOAuthUserAsync(
      "github",
      githubProfile.ProviderUserId,
      normalizedEmail,
      AuthUsernameHelper.BuildUsernameCandidate(githubProfile.Username, normalizedEmail, "github_user"),
      githubProfile.DisplayName,
      githubProfile.ProfilePictureUrl);

    var (token, expiresAt) = GenerateJwtToken(user);
    var (refreshToken, _) = GenerateRefreshToken(user);
    var response = _mapper.Map<AuthResponse>(user);
    response.Token = token;
    response.ExpiresAt = expiresAt;
    response.RefreshToken = refreshToken;
    return response;
  }

  public async Task<AuthResponse> LoginWithGoogleAsync(GoogleAuthRequest request)
  {
    var code = request.Code?.Trim();
    if (string.IsNullOrWhiteSpace(code))
    {
      throw new ArgumentException("Google authorization code is required.");
    }

    var googleProfile = await _googleOAuthClient.GetUserProfileAsync(code);
    var normalizedEmail = googleProfile.Email.Trim().ToLowerInvariant();
    var user = await FindOrCreateOAuthUserAsync(
      "google",
      googleProfile.ProviderUserId,
      normalizedEmail,
      AuthUsernameHelper.BuildUsernameCandidate(googleProfile.DisplayName, normalizedEmail, "google_user"),
      googleProfile.DisplayName,
      googleProfile.ProfilePictureUrl);

    var (token, expiresAt) = GenerateJwtToken(user);
    var (refreshToken, _) = GenerateRefreshToken(user);
    var response = _mapper.Map<AuthResponse>(user);
    response.Token = token;
    response.ExpiresAt = expiresAt;
    response.RefreshToken = refreshToken;
    return response;
  }

  public async Task SendPasswordResetAsync(ForgotPasswordRequest request)
  {
    var normalizedEmail = request.Email.Trim().ToLowerInvariant();
    var user = await _userRepository.GetByEmailAsync(normalizedEmail);
    if (user is null)
    {
      return;
    }

    var tokenLifetimeMinutes = _configuration.GetValue<int?>("PasswordReset:TokenMinutes") ?? 30;
    var rawToken = PasswordResetTokenHelper.GenerateRawToken();
    var tokenHash = PasswordResetTokenHelper.HashToken(rawToken);
    var expiresAt = DateTime.UtcNow.AddMinutes(tokenLifetimeMinutes);

    user.PasswordResetTokenHash = tokenHash;
    user.PasswordResetExpiresAt = expiresAt;
    await _userRepository.UpdateAsync(user);

    var resetUrl = PasswordResetTokenHelper.BuildResetUrl(_configuration, rawToken);

    await _emailSender.SendPasswordResetEmailAsync(user.Email, resetUrl, tokenLifetimeMinutes);
  }

  public async Task ResetPasswordAsync(ResetPasswordRequest request)
  {
    var token = request.Token?.Trim() ?? string.Empty;
    if (string.IsNullOrWhiteSpace(token))
    {
      throw new InvalidOperationException("Password reset link is invalid or has expired.");
    }

    var tokenHash = PasswordResetTokenHelper.HashToken(token);
    var user = await _userRepository.GetByPasswordResetTokenHashAsync(tokenHash);
    if (user is null || user.PasswordResetExpiresAt <= DateTime.UtcNow)
    {
      throw new InvalidOperationException("Password reset link is invalid or has expired.");
    }

    user.PasswordHash = BCrypt.Net.BCrypt.HashPassword(request.Password);
    user.PasswordResetTokenHash = null;
    user.PasswordResetExpiresAt = null;
    await _userRepository.UpdateAsync(user);
  }

  public async Task LinkWithGithubAsync(int userId, GithubAuthRequest request)
  {
    var code = request.Code?.Trim();
    if (string.IsNullOrWhiteSpace(code))
      throw new ArgumentException("GitHub authorization code is required.");

    var githubProfile = await _githubOAuthClient.GetUserProfileAsync(code);
    var normalizedEmail = githubProfile.Email.Trim().ToLowerInvariant();
    await LinkProviderAsync(userId, "github", githubProfile.ProviderUserId, normalizedEmail);
  }

  public async Task LinkWithGoogleAsync(int userId, GoogleAuthRequest request)
  {
    var code = request.Code?.Trim();
    if (string.IsNullOrWhiteSpace(code))
      throw new ArgumentException("Google authorization code is required.");

    var googleProfile = await _googleOAuthClient.GetUserProfileAsync(code);
    var normalizedEmail = googleProfile.Email.Trim().ToLowerInvariant();
    await LinkProviderAsync(userId, "google", googleProfile.ProviderUserId, normalizedEmail);
  }

  private async Task LinkProviderAsync(int userId, string provider, string providerUserId, string normalizedEmail)
  {
    var existingLink = await _linkedAccountRepository.GetByProviderAsync(provider, providerUserId);
    if (existingLink != null && existingLink.UserId != userId)
      throw new InvalidOperationException($"This {provider} account is already linked to a different Favigon account.");

    if (existingLink != null)
    {
      if (!string.Equals(existingLink.ProviderEmail, normalizedEmail, StringComparison.OrdinalIgnoreCase))
      {
        existingLink.ProviderEmail = normalizedEmail;
        await _linkedAccountRepository.UpdateAsync(existingLink);
      }
      return;
    }

    var existingUserLink = await _linkedAccountRepository.GetByUserIdAndProviderAsync(userId, provider);
    if (existingUserLink != null)
      throw new InvalidOperationException($"You already have a {provider} account connected.");

    await _linkedAccountRepository.AddAsync(new LinkedAccount
    {
      UserId = userId,
      Provider = provider,
      ProviderUserId = providerUserId,
      ProviderEmail = normalizedEmail,
    });
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

  private async Task<User> FindOrCreateOAuthUserAsync(
    string provider,
    string providerUserId,
    string normalizedEmail,
    string usernameCandidate,
    string? displayNameCandidate,
    string? profilePictureUrl)
  {
    var existingProvider = await _linkedAccountRepository.GetByProviderAsync(provider, providerUserId);
    if (existingProvider?.User is not null)
    {
      var linkedUser = existingProvider.User;

      if (!string.Equals(existingProvider.ProviderEmail, normalizedEmail, StringComparison.OrdinalIgnoreCase))
      {
        existingProvider.ProviderEmail = normalizedEmail;
        await _linkedAccountRepository.UpdateAsync(existingProvider);
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

    await _linkedAccountRepository.AddAsync(new LinkedAccount
    {
      UserId = user.Id,
      Provider = provider,
      ProviderUserId = providerUserId,
      ProviderEmail = normalizedEmail,
    });

    return user;
  }

  public async Task<AuthResponse> RefreshAsync(string refreshToken)
  {
    var key = _configuration["JwtSettings:Key"] ?? "";
    var issuer = _configuration["JwtSettings:Issuer"];
    var audience = _configuration["JwtSettings:Audience"];
    var signingKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(key));

    ClaimsPrincipal principal;
    try
    {
      principal = new JwtSecurityTokenHandler().ValidateToken(refreshToken, new TokenValidationParameters
      {
        ValidateIssuer = true,
        ValidateAudience = true,
        ValidateIssuerSigningKey = true,
        ValidateLifetime = true,
        ValidIssuer = issuer,
        ValidAudience = audience,
        IssuerSigningKey = signingKey,
        ClockSkew = TimeSpan.FromMinutes(1)
      }, out _);
    }
    catch
    {
      throw new ArgumentException("Invalid or expired refresh token.");
    }

    var tokenType = principal.FindFirstValue("token_type");
    if (tokenType != "refresh")
      throw new ArgumentException("Invalid token type.");

    var userIdStr = principal.FindFirstValue(ClaimTypes.NameIdentifier);
    if (!int.TryParse(userIdStr, out var userId))
      throw new ArgumentException("Invalid token.");

    var user = await _userRepository.GetByIdAsync(userId)
      ?? throw new ArgumentException("User not found.");

    var (newToken, expiresAt) = GenerateJwtToken(user);
    var (newRefreshToken, _) = GenerateRefreshToken(user);

    var response = _mapper.Map<AuthResponse>(user);
    response.Token = newToken;
    response.ExpiresAt = expiresAt;
    response.RefreshToken = newRefreshToken;
    return response;
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

  private (string Token, DateTime ExpiresAt) GenerateRefreshToken(User user)
  {
    var key = _configuration["JwtSettings:Key"] ?? "";
    var issuer = _configuration["JwtSettings:Issuer"];
    var audience = _configuration["JwtSettings:Audience"];
    var expirationDays = _configuration.GetValue<int>("JwtSettings:RefreshTokenDays", 30);
    var expiresAt = DateTime.UtcNow.AddDays(expirationDays);

    var claims = new[]
    {
      new Claim(ClaimTypes.NameIdentifier, user.Id.ToString()),
      new Claim("token_type", "refresh"),
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
