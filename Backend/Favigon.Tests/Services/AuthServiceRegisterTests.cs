using AutoMapper;
using Moq;
using Favigon.Application.DTOs.Requests;
using Favigon.Application.Interfaces;
using Favigon.Application.Mappings;
using Favigon.Application.Services;
using Favigon.Domain.Entities;
using Favigon.Tests.Helpers;

namespace Favigon.Tests.Services;

public class AuthServiceRegisterTests
{
  private readonly Mock<IUserRepository> _userRepo = new();
  private readonly Mock<ILinkedAccountRepository> _linkedRepo = new();
  private readonly Mock<IGithubOAuthClient> _github = new();
  private readonly Mock<IGoogleOAuthClient> _google = new();
  private readonly Mock<IEmailSender> _email = new();
  private readonly IMapper _mapper;
  private readonly AuthService _sut;

  public AuthServiceRegisterTests()
  {
    var config = new MapperConfiguration(cfg => cfg.AddProfile<MappingProfile>());
    _mapper = config.CreateMapper();
    _sut = new AuthService(
        _userRepo.Object, _linkedRepo.Object,
        _github.Object, _google.Object,
        _email.Object, _mapper,
        TestConfiguration.Build());
  }

  [Fact]
  public async Task Register_WithValidRequest_ReturnsAuthResponseWithToken()
  {
    // Arrange
    _userRepo.Setup(r => r.GetByUsernameAsync(It.IsAny<string>())).ReturnsAsync((User?)null);
    _userRepo.Setup(r => r.GetByEmailAsync(It.IsAny<string>())).ReturnsAsync((User?)null);
    _userRepo.Setup(r => r.AddAsync(It.IsAny<User>()))
        .ReturnsAsync((User u) => { u.Id = 1; return u; });

    var request = new RegisterRequest
    {
      Username = "testuser",
      DisplayName = "Test User",
      Email = "test@example.com",
      Password = "Password123!"
    };

    // Act
    var result = await _sut.RegisterAsync(request);

    // Assert
    Assert.NotNull(result);
    Assert.False(string.IsNullOrEmpty(result.Token));
    Assert.False(string.IsNullOrEmpty(result.RefreshToken));
    Assert.Equal("testuser", result.Username);
    Assert.Equal("test@example.com", result.Email);
    Assert.True(result.ExpiresAt > DateTime.UtcNow);
  }

  [Fact]
  public async Task Register_NormalizesUsernameToLowercase()
  {
    // Arrange
    User? capturedUser = null;
    _userRepo.Setup(r => r.GetByUsernameAsync(It.IsAny<string>())).ReturnsAsync((User?)null);
    _userRepo.Setup(r => r.GetByEmailAsync(It.IsAny<string>())).ReturnsAsync((User?)null);
    _userRepo.Setup(r => r.AddAsync(It.IsAny<User>()))
        .Callback<User>(u => capturedUser = u)
        .ReturnsAsync((User u) => { u.Id = 1; return u; });

    var request = new RegisterRequest
    {
      Username = "TestUser",
      DisplayName = "Test User",
      Email = "test@example.com",
      Password = "Password123!"
    };

    // Act
    await _sut.RegisterAsync(request);

    // Assert
    Assert.Equal("testuser", capturedUser!.Username);
  }

  [Fact]
  public async Task Register_WhenUsernameExists_ThrowsInvalidOperationException()
  {
    // Arrange
    _userRepo.Setup(r => r.GetByUsernameAsync("testuser"))
        .ReturnsAsync(new User { Id = 99, Username = "testuser", Email = "other@example.com" });

    var request = new RegisterRequest
    {
      Username = "testuser",
      DisplayName = "Test User",
      Email = "test@example.com",
      Password = "Password123!"
    };

    // Act & Assert
    var ex = await Assert.ThrowsAsync<InvalidOperationException>(() => _sut.RegisterAsync(request));
    Assert.Equal("Username already exists.", ex.Message);
  }

  [Fact]
  public async Task Register_WhenEmailExists_ThrowsInvalidOperationException()
  {
    // Arrange
    _userRepo.Setup(r => r.GetByUsernameAsync(It.IsAny<string>())).ReturnsAsync((User?)null);
    _userRepo.Setup(r => r.GetByEmailAsync("test@example.com"))
        .ReturnsAsync(new User { Id = 99, Username = "other", Email = "test@example.com" });

    var request = new RegisterRequest
    {
      Username = "newuser",
      DisplayName = "New User",
      Email = "test@example.com",
      Password = "Password123!"
    };

    // Act & Assert
    var ex = await Assert.ThrowsAsync<InvalidOperationException>(() => _sut.RegisterAsync(request));
    Assert.Equal("Email already exists.", ex.Message);
  }

  [Fact]
  public async Task Register_PasswordIsHashed_NotStoredAsPlainText()
  {
    // Arrange
    User? capturedUser = null;
    _userRepo.Setup(r => r.GetByUsernameAsync(It.IsAny<string>())).ReturnsAsync((User?)null);
    _userRepo.Setup(r => r.GetByEmailAsync(It.IsAny<string>())).ReturnsAsync((User?)null);
    _userRepo.Setup(r => r.AddAsync(It.IsAny<User>()))
        .Callback<User>(u => capturedUser = u)
        .ReturnsAsync((User u) => { u.Id = 1; return u; });

    var request = new RegisterRequest
    {
      Username = "testuser",
      DisplayName = "Test User",
      Email = "test@example.com",
      Password = "MySecret123!"
    };

    // Act
    await _sut.RegisterAsync(request);

    // Assert
    Assert.NotNull(capturedUser);
    Assert.NotEqual("MySecret123!", capturedUser!.PasswordHash);
    Assert.True(BCrypt.Net.BCrypt.Verify("MySecret123!", capturedUser.PasswordHash));
  }
}
