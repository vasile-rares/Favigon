using DevBox.Application.Interfaces;
using DevBox.Domain.Entities;

namespace DevBox.Application.Services;

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

  public async Task<User> CreateAsync(User user)
  {
    user.Username = user.Username.Trim().ToLowerInvariant();
    user.DisplayName = user.DisplayName.Trim();

    if (string.IsNullOrWhiteSpace(user.Role))
    {
      user.Role = "User";
    }

    var existingByUsername = await _userRepository.GetByUsernameAsync(user.Username);
    if (existingByUsername != null)
    {
      throw new InvalidOperationException("Username already exists.");
    }

    var existingByEmail = await _userRepository.GetByEmailAsync(user.Email);
    if (existingByEmail != null)
    {
      throw new InvalidOperationException("Email already exists.");
    }

    return await _userRepository.AddAsync(user);
  }

  public async Task<User?> UpdateAsync(int id, User updated)
  {
    var existing = await _userRepository.GetByIdAsync(id);
    if (existing == null)
    {
      return null;
    }

    var normalizedUsername = updated.Username.Trim().ToLowerInvariant();
    if (!string.Equals(existing.Username, normalizedUsername, StringComparison.Ordinal))
    {
      var byUsername = await _userRepository.GetByUsernameAsync(normalizedUsername);
      if (byUsername != null && byUsername.Id != id)
      {
        throw new InvalidOperationException("Username already exists.");
      }
    }

    if (!string.Equals(existing.Email, updated.Email, StringComparison.OrdinalIgnoreCase))
    {
      var byEmail = await _userRepository.GetByEmailAsync(updated.Email);
      if (byEmail != null && byEmail.Id != id)
      {
        throw new InvalidOperationException("Email already exists.");
      }
    }

    existing.DisplayName = updated.DisplayName.Trim();
    existing.Username = normalizedUsername;
    existing.Email = updated.Email;
    existing.PasswordHash = updated.PasswordHash;
    existing.ProfilePictureUrl = updated.ProfilePictureUrl;
    existing.Role = string.IsNullOrWhiteSpace(updated.Role) ? existing.Role : updated.Role;

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
