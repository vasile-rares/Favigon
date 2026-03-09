using System.IdentityModel.Tokens.Jwt;
using System.Net;
using System.Security.Claims;
using System.Text;
using Prismatic.Application.DTOs.Requests;
using Prismatic.Application.Helpers;
using Prismatic.Application.DTOs.Responses;
using Prismatic.Application.Interfaces;
using Prismatic.Domain.Entities;
using AutoMapper;
using Microsoft.Extensions.Configuration;
using Microsoft.IdentityModel.Tokens;

namespace Prismatic.Application.Services;

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
    var response = _mapper.Map<AuthResponse>(user);
    response.Token = token;
    response.ExpiresAt = expiresAt;
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
    var response = _mapper.Map<AuthResponse>(user);
    response.Token = token;
    response.ExpiresAt = expiresAt;
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
    var response = _mapper.Map<AuthResponse>(user);
    response.Token = token;
    response.ExpiresAt = expiresAt;
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
    var response = _mapper.Map<AuthResponse>(user);
    response.Token = token;
    response.ExpiresAt = expiresAt;
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
    var encodedUrl = WebUtility.HtmlEncode(resetUrl);
    var htmlBody = string.Join(
      string.Empty,
      "<p>Hello,</p>",
      "<p>We received a request to reset your Prismatic password.</p>",
      $"<p><a href=\"{encodedUrl}\">Reset your password</a></p>",
      "<p>If you did not request this, you can ignore this email.</p>",
      $"<p>This link expires in {tokenLifetimeMinutes} minutes.</p>");
    var textBody =
      "We received a request to reset your Prismatic password." + Environment.NewLine +
      $"Reset your password here: {resetUrl}" + Environment.NewLine +
      "If you did not request this, you can ignore this email.";

    await _emailSender.SendEmailAsync(
      user.Email,
      "Reset your Prismatic password",
      htmlBody,
      textBody);
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
