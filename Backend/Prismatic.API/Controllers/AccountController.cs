using Microsoft.AspNetCore.Mvc;
using Prismatic.Application.DTOs.Requests;
using Prismatic.Application.Interfaces;

namespace Prismatic.API.Controllers;

[ApiController]
[Route("api/account")]
public class AccountController : ControllerBase
{
  private readonly IAuthService _authService;

  public AccountController(IAuthService authService)
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

  [HttpPost("oauth2/github")]
  public async Task<IActionResult> LoginWithGithub([FromBody] GithubAuthRequest request)
  {
    var response = await _authService.LoginWithGithubAsync(request);
    SetTokenCookie(response.Token);
    return Ok(new { message = "GitHub authentication successful." });
  }

  [HttpPost("oauth2/google")]
  public async Task<IActionResult> LoginWithGoogle([FromBody] GoogleAuthRequest request)
  {
    var response = await _authService.LoginWithGoogleAsync(request);
    SetTokenCookie(response.Token);
    return Ok(new { message = "Google authentication successful." });
  }

  [HttpPost("forgot-password")]
  public async Task<IActionResult> ForgotPassword([FromBody] ForgotPasswordRequest request)
  {
    await _authService.SendPasswordResetAsync(request);
    return Ok(new
    {
      message = "If an account exists for this email, a password reset email has been sent. Please check your inbox."
    });
  }

  [HttpPost("reset-password")]
  public async Task<IActionResult> ResetPassword([FromBody] ResetPasswordRequest request)
  {
    await _authService.ResetPasswordAsync(request);
    return Ok(new { message = "Password reset successful. You can now sign in with your new password." });
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