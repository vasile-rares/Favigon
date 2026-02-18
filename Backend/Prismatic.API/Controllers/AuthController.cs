using Prismatic.Application.DTOs.Requests;
using Prismatic.Application.DTOs.Responses;
using Prismatic.Application.Interfaces;
using Microsoft.AspNetCore.Mvc;

namespace Prismatic.API.Controllers;

[ApiController]
[Route("api/[controller]")]
public class AuthController : ControllerBase
{
  private readonly IAuthService _authService;

  public AuthController(IAuthService authService)
  {
    _authService = authService;
  }

  [HttpPost("register")]
  public async Task<IActionResult> Register([FromBody] RegisterRequest request)
  {
    var response = await _authService.RegisterAsync(request);
    SetTokenCookie(response.Token);
    return Ok(new { message = "User registered successfully." });
  }

  [HttpPost("login")]
  public async Task<IActionResult> Login([FromBody] LoginRequest request)
  {
    var response = await _authService.LoginAsync(request);
    if (response == null)
    {
      return Unauthorized(new { message = "Invalid email or password." });
    }

    SetTokenCookie(response.Token);
    return Ok(new { message = "Login successful." });
  }

  [HttpPost("logout")]
  public IActionResult Logout()
  {
    Response.Cookies.Delete("jwt");
    return Ok(new { message = "Logged out successfully" });
  }

  private void SetTokenCookie(string token)
  {
    var cookieOptions = new CookieOptions
    {
      HttpOnly = true,
      Secure = false,
      SameSite = SameSiteMode.Strict,
      Expires = DateTime.UtcNow.AddDays(7)
    };

    Response.Cookies.Append("jwt", token, cookieOptions);
  }
}
