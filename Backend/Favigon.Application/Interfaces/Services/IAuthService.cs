using Favigon.Application.DTOs.Requests;
using Favigon.Application.DTOs.Responses;

namespace Favigon.Application.Interfaces;

public interface IAuthService
{
  Task<AuthResponse> RegisterAsync(RegisterRequest request);
  Task<AuthResponse?> LoginAsync(LoginRequest request);
  Task<AuthResponse> LoginWithGithubAsync(GithubAuthRequest request);
  Task<AuthResponse> LoginWithGoogleAsync(GoogleAuthRequest request);
  Task LinkWithGithubAsync(int userId, GithubAuthRequest request);
  Task LinkWithGoogleAsync(int userId, GoogleAuthRequest request);
  Task SendPasswordResetAsync(ForgotPasswordRequest request);
  Task ResetPasswordAsync(ResetPasswordRequest request);
  Task<AuthResponse> RefreshAsync(string refreshToken);
}
