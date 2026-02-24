using Prismatic.Application.DTOs.Requests;
using Prismatic.Application.DTOs.Responses;

namespace Prismatic.Application.Interfaces;

public interface IAuthService
{
  Task<AuthResponse> RegisterAsync(RegisterRequest request);
  Task<AuthResponse?> LoginAsync(LoginRequest request);
  Task<AuthResponse> LoginWithGithubAsync(GithubAuthRequest request);
}
