using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
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
  private readonly IConfiguration _configuration;

  public AuthService(
      IUserRepository userRepository,
      IConfiguration configuration)
  {
    _userRepository = userRepository;
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
