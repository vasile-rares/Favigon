using Favigon.Application.DTOs.Requests;
using Favigon.Application.Interfaces;
using Favigon.Domain.Entities;

namespace Favigon.Application.Services;

public class UserService : IUserService
{
  private readonly IUserRepository _userRepository;

  public UserService(IUserRepository userRepository)
  {
    _userRepository = userRepository;
  }

  public Task<IReadOnlyList<User>> GetAllAsync()
  {
    return _userRepository.GetAllAsync();
  }

  public Task<User?> GetByIdAsync(int id)
  {
    return _userRepository.GetByIdAsync(id);
  }

  public Task<User?> GetByUsernameAsync(string username)
  {
    return _userRepository.GetByUsernameAsync(username);
  }

  public Task<IReadOnlyList<User>> SearchAsync(string query)
  {
    var sanitized = query.Trim();
    return _userRepository.SearchByQueryAsync(sanitized, 10);
  }

  public async Task<User> CreateAsync(UserCreateRequest request)
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
      Role = string.IsNullOrWhiteSpace(request.Role) ? "User" : request.Role
    };

    return await _userRepository.AddAsync(user);
  }

  public async Task<User?> UpdateAsync(int id, UserUpdateRequest request)
  {
    var existing = await _userRepository.GetByIdAsync(id);
    if (existing == null)
    {
      return null;
    }

    request.Username = request.Username.Trim().ToLowerInvariant();
    request.DisplayName = request.DisplayName.Trim();
    request.Email = request.Email.Trim();

    var normalizedUsername = request.Username;
    if (!string.Equals(existing.Username, normalizedUsername, StringComparison.Ordinal))
    {
      var byUsername = await _userRepository.GetByUsernameAsync(normalizedUsername);
      if (byUsername != null && byUsername.Id != id)
      {
        throw new InvalidOperationException("Username already exists.");
      }
    }

    if (!string.Equals(existing.Email, request.Email, StringComparison.OrdinalIgnoreCase))
    {
      var byEmail = await _userRepository.GetByEmailAsync(request.Email);
      if (byEmail != null && byEmail.Id != id)
      {
        throw new InvalidOperationException("Email already exists.");
      }
    }

    existing.DisplayName = request.DisplayName;
    existing.Username = normalizedUsername;
    existing.Email = request.Email;
    if (!string.IsNullOrWhiteSpace(request.Password))
    {
      existing.PasswordHash = BCrypt.Net.BCrypt.HashPassword(request.Password);
    }
    existing.ProfilePictureUrl = request.ProfilePictureUrl;
    existing.Role = string.IsNullOrWhiteSpace(request.Role) ? existing.Role : request.Role;

    await _userRepository.UpdateAsync(existing);
    return existing;
  }

  public async Task<bool> DeleteAsync(int id)
  {
    var existing = await _userRepository.GetByIdAsync(id);
    if (existing == null)
    {
      return false;
    }

    await _userRepository.DeleteAsync(existing);
    return true;
  }
}
