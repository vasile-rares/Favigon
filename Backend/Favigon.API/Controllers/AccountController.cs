using Favigon.API.Extensions;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.AspNetCore.Authorization;
using Favigon.Application.DTOs.Requests;
using Favigon.Application.DTOs.Responses;
using Favigon.Application.Interfaces;

namespace Favigon.API.Controllers;

[ApiController]
[Route("api/account")]
[EnableRateLimiting("auth")]
public class AccountController : ControllerBase
{
  private readonly IAuthService _authService;
  private readonly IWebHostEnvironment _environment;

  public AccountController(IAuthService authService, IWebHostEnvironment environment)
  {
    _authService = authService;
    _environment = environment;
  }

  [HttpPost("register")]
  public async Task<IActionResult> Register([FromBody] RegisterRequest request)
  {
    var response = await _authService.RegisterAsync(request);
    SetAccessTokenCookie(response.Token);
    SetRefreshTokenCookie(response.RefreshToken);
    return Ok(new { message = "User registered successfully." });
  }

  [HttpPost("login")]
  public async Task<IActionResult> Login([FromBody] LoginRequest request)
  {
    var response = await _authService.LoginAsync(request);
    if (response == null)
      return Unauthorized(new { message = "Invalid email or password." });

    return CreateAuthResult(
      response,
      "Login successful.",
      "We sent a verification code to your email to finish signing in.");
  }

  [HttpPost("oauth2/github")]
  public async Task<IActionResult> LoginWithGithub([FromBody] GithubAuthRequest request)
  {
    var response = await _authService.LoginWithGithubAsync(request);
    return CreateAuthResult(
      response,
      "GitHub authentication successful.",
      "We sent a verification code to your email to finish signing in.");
  }

  [HttpPost("oauth2/google")]
  public async Task<IActionResult> LoginWithGoogle([FromBody] GoogleAuthRequest request)
  {
    var response = await _authService.LoginWithGoogleAsync(request);
    return CreateAuthResult(
      response,
      "Google authentication successful.",
      "We sent a verification code to your email to finish signing in.");
  }

  [HttpPost("two-factor/verify-login")]
  public async Task<IActionResult> VerifyTwoFactorLogin([FromBody] TwoFactorLoginVerifyRequest request)
  {
    var response = await _authService.VerifyTwoFactorLoginAsync(request);
    SetAccessTokenCookie(response.Token);
    SetRefreshTokenCookie(response.RefreshToken);
    return Ok(new { message = "Login successful." });
  }

  [HttpPost("oauth2/github/link")]
  [Authorize]
  [DisableRateLimiting]
  public async Task<IActionResult> LinkWithGithub([FromBody] GithubAuthRequest request)
  {
    if (!User.TryGetUserId(out var userId)) return Unauthorized();

    await _authService.LinkWithGithubAsync(userId, request);
    return Ok(new { message = "GitHub account linked successfully." });
  }

  [HttpPost("oauth2/google/link")]
  [Authorize]
  [DisableRateLimiting]
  public async Task<IActionResult> LinkWithGoogle([FromBody] GoogleAuthRequest request)
  {
    if (!User.TryGetUserId(out var userId)) return Unauthorized();

    await _authService.LinkWithGoogleAsync(userId, request);
    return Ok(new { message = "Google account linked successfully." });
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

  [HttpPost("set-password")]
  [Authorize]
  public async Task<IActionResult> SetPassword([FromBody] SetPasswordRequest request)
  {
    if (!User.TryGetUserId(out var userId)) return Unauthorized();

    await _authService.SetPasswordAsync(userId, request);
    return Ok(new
    {
      message = "You're all set. We've sent a confirmation email to your inbox."
    });
  }

  [HttpPost("change-password")]
  [Authorize]
  public async Task<IActionResult> ChangePassword([FromBody] ChangePasswordRequest request)
  {
    if (!User.TryGetUserId(out var userId)) return Unauthorized();

    await _authService.ChangePasswordAsync(userId, request);
    return Ok(new { message = "Password changed successfully." });
  }

  [HttpPost("two-factor/enable/request")]
  [Authorize]
  public async Task<IActionResult> RequestEnableTwoFactor()
  {
    if (!User.TryGetUserId(out var userId)) return Unauthorized();

    await _authService.SendEnableTwoFactorCodeAsync(userId);
    return Ok(new { message = "We sent a verification code to your email." });
  }

  [HttpPost("two-factor/enable/confirm")]
  [Authorize]
  public async Task<IActionResult> ConfirmEnableTwoFactor([FromBody] TwoFactorCodeRequest request)
  {
    if (!User.TryGetUserId(out var userId)) return Unauthorized();

    await _authService.EnableTwoFactorAsync(userId, request);
    return Ok(new { message = "Two-factor authentication is now on." });
  }

  [HttpPost("two-factor/disable/request")]
  [Authorize]
  public async Task<IActionResult> RequestDisableTwoFactor()
  {
    if (!User.TryGetUserId(out var userId)) return Unauthorized();

    await _authService.SendDisableTwoFactorCodeAsync(userId);
    return Ok(new { message = "We sent a verification code to your email." });
  }

  [HttpPost("two-factor/disable/confirm")]
  [Authorize]
  public async Task<IActionResult> ConfirmDisableTwoFactor([FromBody] TwoFactorCodeRequest request)
  {
    if (!User.TryGetUserId(out var userId)) return Unauthorized();

    await _authService.DisableTwoFactorAsync(userId, request);
    return Ok(new { message = "Two-factor authentication is now off." });
  }

  [HttpPost("refresh")]
  [DisableRateLimiting]
  public async Task<IActionResult> Refresh()
  {
    if (!Request.Cookies.TryGetValue("refresh_token", out var refreshToken))
      return Unauthorized(new { message = "Refresh token not found." });

    try
    {
      var response = await _authService.RefreshAsync(refreshToken);
      SetAccessTokenCookie(response.Token);
      SetRefreshTokenCookie(response.RefreshToken);
      return Ok(new { message = "Token refreshed." });
    }
    catch (Exception)
    {
      DeleteRefreshTokenCookie();
      Response.Cookies.Delete("jwt");
      return Unauthorized(new { message = "Refresh token is invalid or has expired. Please log in again." });
    }
  }

  [HttpPost("logout")]
  [DisableRateLimiting]
  public IActionResult Logout()
  {
    Response.Cookies.Delete("jwt");
    DeleteRefreshTokenCookie();
    return Ok(new { message = "Logged out successfully" });
  }

  private bool IsSecure => !_environment.IsDevelopment();

  private IActionResult CreateAuthResult(AuthResponse response, string successMessage, string twoFactorMessage)
  {
    if (response.RequiresTwoFactor)
    {
      return Ok(new
      {
        message = twoFactorMessage,
        requiresTwoFactor = true,
        twoFactorToken = response.TwoFactorToken,
        twoFactorEmailHint = response.TwoFactorEmailHint,
      });
    }

    SetAccessTokenCookie(response.Token);
    SetRefreshTokenCookie(response.RefreshToken);
    return Ok(new { message = successMessage });
  }

  private void SetAccessTokenCookie(string token)
  {
    Response.Cookies.Append("jwt", token, new CookieOptions
    {
      HttpOnly = true,
      Secure = IsSecure,
      SameSite = SameSiteMode.Strict,
      Expires = DateTime.UtcNow.AddDays(7)
    });
  }

  private void SetRefreshTokenCookie(string refreshToken)
  {
    Response.Cookies.Append("refresh_token", refreshToken, new CookieOptions
    {
      HttpOnly = true,
      Secure = IsSecure,
      SameSite = SameSiteMode.Strict,
      Path = "/api/account/refresh",
      Expires = DateTime.UtcNow.AddDays(30)
    });
  }

  private void DeleteRefreshTokenCookie()
  {
    Response.Cookies.Append("refresh_token", "", new CookieOptions
    {
      HttpOnly = true,
      Secure = IsSecure,
      SameSite = SameSiteMode.Strict,
      Path = "/api/account/refresh",
      Expires = DateTime.UtcNow.AddDays(-1)
    });
  }
}
