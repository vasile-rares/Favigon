using DevBox.Application.DTOs.Requests;
using DevBox.Application.DTOs.Responses;

namespace DevBox.Application.Interfaces;

public interface IAuthService
{
  Task<AuthResponse> RegisterAsync(RegisterRequest request);
  Task<AuthResponse?> LoginAsync(LoginRequest request);
}
