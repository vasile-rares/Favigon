using Moq;
using Favigon.Application.DTOs.Requests;
using Favigon.Application.Interfaces;
using Favigon.Application.Services;
using Favigon.Domain.Entities;

namespace Favigon.Tests.Services;

public class UserServiceTests
{
  private readonly Mock<IUserRepository> _userRepo = new();
  private readonly UserService _sut;

  public UserServiceTests()
  {
    _sut = new UserService(_userRepo.Object);
  }

  [Fact]
  public async Task Create_WithValidRequest_AddsUser()
  {
    // Arrange
    _userRepo.Setup(r => r.GetByUsernameAsync(It.IsAny<string>())).ReturnsAsync((User?)null);
    _userRepo.Setup(r => r.GetByEmailAsync(It.IsAny<string>())).ReturnsAsync((User?)null);
    _userRepo.Setup(r => r.AddAsync(It.IsAny<User>()))
        .ReturnsAsync((User u) => { u.Id = 1; return u; });

    var request = new UserCreateRequest
    {
      Username = "newuser",
      DisplayName = "New User",
      Email = "new@example.com",
      Password = "Password123!"
    };

    // Act
    var result = await _sut.CreateAsync(request);

    // Assert
    Assert.NotNull(result);
    Assert.Equal("newuser", result.Username);
    _userRepo.Verify(r => r.AddAsync(It.IsAny<User>()), Times.Once);
  }

  [Fact]
  public async Task Create_WhenUsernameExists_ThrowsInvalidOperationException()
  {
    // Arrange
    _userRepo.Setup(r => r.GetByUsernameAsync("existing"))
        .ReturnsAsync(new User { Id = 1, Username = "existing", Email = "x@x.com" });

    var request = new UserCreateRequest
    {
      Username = "existing",
      DisplayName = "Test",
      Email = "new@example.com",
      Password = "Password123!"
    };

    // Act & Assert
    var ex = await Assert.ThrowsAsync<InvalidOperationException>(() => _sut.CreateAsync(request));
    Assert.Equal("Username already exists.", ex.Message);
  }

  [Fact]
  public async Task Update_WhenUserNotFound_ReturnsNull()
  {
    // Arrange
    _userRepo.Setup(r => r.GetByIdAsync(99)).ReturnsAsync((User?)null);

    var request = new UserUpdateRequest
    {
      Username = "test",
      DisplayName = "Test",
      Email = "test@test.com"
    };

    // Act
    var result = await _sut.UpdateAsync(99, request);

    // Assert
    Assert.Null(result);
  }

  [Fact]
  public async Task Update_WithNewPassword_HashesPassword()
  {
    // Arrange
    var existingUser = new User
    {
      Id = 1,
      Username = "user1",
      DisplayName = "User",
      Email = "user@test.com",
      PasswordHash = BCrypt.Net.BCrypt.HashPassword("OldPass"),
      Role = "User"
    };
    _userRepo.Setup(r => r.GetByIdAsync(1)).ReturnsAsync(existingUser);
    _userRepo.Setup(r => r.GetByUsernameAsync("user1")).ReturnsAsync(existingUser);
    _userRepo.Setup(r => r.GetByEmailAsync("user@test.com")).ReturnsAsync(existingUser);

    var request = new UserUpdateRequest
    {
      Username = "user1",
      DisplayName = "User",
      Email = "user@test.com",
      Password = "NewPass123!"
    };

    // Act
    var result = await _sut.UpdateAsync(1, request);

    // Assert
    Assert.NotNull(result);
    Assert.NotEqual("NewPass123!", result!.PasswordHash);
    Assert.True(BCrypt.Net.BCrypt.Verify("NewPass123!", result.PasswordHash));
  }

  [Fact]
  public async Task Delete_WhenUserExists_ReturnsTrueAndCallsDelete()
  {
    // Arrange
    var user = new User { Id = 5, Username = "del", Email = "del@test.com" };
    _userRepo.Setup(r => r.GetByIdAsync(5)).ReturnsAsync(user);

    // Act
    var result = await _sut.DeleteAsync(5);

    // Assert
    Assert.True(result);
    _userRepo.Verify(r => r.DeleteAsync(user), Times.Once);
  }

  [Fact]
  public async Task Delete_WhenUserNotFound_ReturnsFalse()
  {
    // Arrange
    _userRepo.Setup(r => r.GetByIdAsync(99)).ReturnsAsync((User?)null);

    // Act
    var result = await _sut.DeleteAsync(99);

    // Assert
    Assert.False(result);
    _userRepo.Verify(r => r.DeleteAsync(It.IsAny<User>()), Times.Never);
  }
}
