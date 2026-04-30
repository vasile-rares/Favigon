using AutoMapper;
using Favigon.Application.DTOs.Requests;
using Favigon.Application.DTOs.Responses;
using Favigon.Application.Helpers;
using Favigon.Application.Interfaces;
using Favigon.Domain.Entities;

namespace Favigon.Application.Services;

public class UserService : IUserService
{
  private const long MaxProfileImageSizeBytes = 10 * 1024 * 1024;

  private static readonly HashSet<string> AllowedProfileImageContentTypes = new(StringComparer.OrdinalIgnoreCase)
  {
    "image/png",
    "image/jpeg",
    "image/webp",
    "image/gif",
    "image/avif"
  };

  private readonly IUserRepository _userRepository;
  private readonly ILinkedAccountRepository _linkedAccountRepository;
  private readonly IUserProfileImageStorage _userProfileImageStorage;
  private readonly IMapper _mapper;
  private readonly IAuditLogger _audit;

  public UserService(
    IUserRepository userRepository,
    ILinkedAccountRepository linkedAccountRepository,
    IUserProfileImageStorage userProfileImageStorage,
    IMapper mapper,
    IAuditLogger audit)
  {
    _userRepository = userRepository;
    _linkedAccountRepository = linkedAccountRepository;
    _userProfileImageStorage = userProfileImageStorage;
    _mapper = mapper;
    _audit = audit;
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

    return await BuildMyProfileResponseAsync(user);
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

    return await BuildMyProfileResponseAsync(user);
  }

  public async Task<UserResponse?> UpdateMyProfileImageAsync(
    int userId,
    UserProfileImageUploadRequest request,
    string publicBaseUrl,
    CancellationToken cancellationToken = default)
  {
    var user = await _userRepository.GetByIdAsync(userId);
    if (user == null) return null;

    ValidateProfileImageUploadRequest(request);

    var previousProfilePictureUrl = user.ProfilePictureUrl;
    var assetPath = await _userProfileImageStorage.SaveImageAsync(
      userId,
      request.Content,
      request.FileName,
      request.ContentType,
      cancellationToken);
    var assetUrl = BuildAbsoluteAssetUrl(publicBaseUrl, assetPath);

    try
    {
      user.ProfilePictureUrl = assetUrl;
      await _userRepository.UpdateAsync(user);
    }
    catch
    {
      await _userProfileImageStorage.DeleteImageAsync(userId, assetPath, CancellationToken.None);
      throw;
    }

    if (!string.IsNullOrWhiteSpace(previousProfilePictureUrl)
      && !string.Equals(previousProfilePictureUrl, assetUrl, StringComparison.OrdinalIgnoreCase))
    {
      await _userProfileImageStorage.DeleteImageAsync(
        userId,
        previousProfilePictureUrl,
        CancellationToken.None);
    }

    return await BuildMyProfileResponseAsync(user);
  }

  public async Task<bool> DeleteMyAccountAsync(int userId)
  {
    var user = await _userRepository.GetByIdAsync(userId);
    if (user == null) return false;

    await _userRepository.DeleteAsync(user);
    await _userProfileImageStorage.DeleteUserAssetsAsync(userId, CancellationToken.None);
    _audit.AccountDeleted(userId);
    return true;
  }

  public async Task<bool> UnlinkProviderAsync(int userId, string provider)
  {
    var link = await _linkedAccountRepository.GetByUserIdAndProviderAsync(userId, provider);
    if (link == null) return false;

    await _linkedAccountRepository.RemoveAsync(link);
    _audit.OAuthProviderUnlinked(userId, provider);
    return true;
  }

  private async Task<UserResponse> BuildMyProfileResponseAsync(User user)
  {
    var linkedAccounts = await _linkedAccountRepository.GetByUserIdAsync(user.Id);
    var response = _mapper.Map<UserResponse>(user);
    response.LinkedAccounts = _mapper.Map<List<LinkedAccountResponse>>(linkedAccounts);
    return response;
  }

  private static void ValidateProfileImageUploadRequest(UserProfileImageUploadRequest request)
  {
    ImageUploadValidator.Validate(new ImageUploadRequest(
      Content: request.Content,
      FileName: request.FileName,
      ContentType: request.ContentType,
      Length: request.Length,
      MaxBytes: MaxProfileImageSizeBytes,
      AllowedTypes: AllowedProfileImageContentTypes,
      AssetLabel: "Image file",
      UnsupportedFormatMessage: "Only PNG, JPEG, WebP, GIF, and AVIF images are supported."));
  }

  private static string BuildAbsoluteAssetUrl(string publicBaseUrl, string assetPath)
  {
    if (string.IsNullOrWhiteSpace(publicBaseUrl))
    {
      throw new ArgumentException("Public base URL is required.", nameof(publicBaseUrl));
    }

    if (string.IsNullOrWhiteSpace(assetPath))
    {
      throw new ArgumentException("Profile image path is required.", nameof(assetPath));
    }

    var normalizedBaseUrl = publicBaseUrl.TrimEnd('/');
    var normalizedAssetPath = assetPath.StartsWith('/') ? assetPath : $"/{assetPath}";
    return $"{normalizedBaseUrl}{normalizedAssetPath}";
  }
}
