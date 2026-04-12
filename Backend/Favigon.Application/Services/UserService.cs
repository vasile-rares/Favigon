using AutoMapper;
using Favigon.Application.DTOs.Requests;
using Favigon.Application.DTOs.Responses;
using Favigon.Application.Interfaces;
using Favigon.Domain.Entities;

namespace Favigon.Application.Services;

public class UserService : IUserService
{
  private readonly IUserRepository _userRepository;
  private readonly ILinkedAccountRepository _linkedAccountRepository;
  private readonly IMapper _mapper;

  public UserService(
    IUserRepository userRepository,
    ILinkedAccountRepository linkedAccountRepository,
    IMapper mapper)
  {
    _userRepository = userRepository;
    _linkedAccountRepository = linkedAccountRepository;
    _mapper = mapper;
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
      HasPassword = true,
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
      existing.HasPassword = true;
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

  public async Task<UserResponse?> GetMyProfileAsync(int userId)
  {
    var user = await _userRepository.GetByIdAsync(userId);
    if (user == null) return null;

    var linkedAccounts = await _linkedAccountRepository.GetByUserIdAsync(userId);
    var response = _mapper.Map<UserResponse>(user);
    response.LinkedAccounts = _mapper.Map<List<LinkedAccountResponse>>(linkedAccounts);
    return response;
  }

  public async Task<UserResponse?> UpdateMyProfileAsync(int userId, UserProfileUpdateRequest request)
  {
    var user = await _userRepository.GetByIdAsync(userId);
    if (user == null) return null;

    request.Username = request.Username.Trim().ToLowerInvariant();
    request.DisplayName = request.DisplayName.Trim();

    if (!string.Equals(user.Username, request.Username, StringComparison.Ordinal))
    {
      var byUsername = await _userRepository.GetByUsernameAsync(request.Username);
      if (byUsername != null && byUsername.Id != userId)
        throw new InvalidOperationException("Username already exists.");
    }

    user.DisplayName = request.DisplayName;
    user.Username = request.Username;
    user.Bio = string.IsNullOrWhiteSpace(request.Bio) ? null : request.Bio.Trim();

    await _userRepository.UpdateAsync(user);

    var linkedAccounts = await _linkedAccountRepository.GetByUserIdAsync(userId);
    var response = _mapper.Map<UserResponse>(user);
    response.LinkedAccounts = _mapper.Map<List<LinkedAccountResponse>>(linkedAccounts);
    return response;
  }

  public async Task<bool> DeleteMyAccountAsync(int userId)
  {
    var user = await _userRepository.GetByIdAsync(userId);
    if (user == null) return false;

    await _userRepository.DeleteAsync(user);
    return true;
  }

  public async Task<bool> UnlinkProviderAsync(int userId, string provider)
  {
    var link = await _linkedAccountRepository.GetByUserIdAndProviderAsync(userId, provider);
    if (link == null) return false;

    await _linkedAccountRepository.RemoveAsync(link);
    return true;
  }
}
