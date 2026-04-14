using Favigon.Application.DTOs.Requests;
using Favigon.Application.Interfaces;
using Favigon.Domain.Entities;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http.Extensions;
using Microsoft.AspNetCore.Mvc;
using System.Security.Claims;

namespace Favigon.API.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class UsersController : ControllerBase
{
  private readonly IUserService _userService;

  public UsersController(IUserService userService)
  {
    _userService = userService;
  }

  [HttpGet]
  public async Task<IActionResult> GetAll()
  {
    var users = await _userService.GetAllAsync();
    return Ok(users);
  }

  [HttpGet("me")]
  public async Task<IActionResult> GetMe()
  {
    var userIdClaim = User.FindFirstValue(ClaimTypes.NameIdentifier);
    if (!int.TryParse(userIdClaim, out var userId))
      return Unauthorized();

    var profile = await _userService.GetMyProfileAsync(userId);
    if (profile == null) return NotFound();

    return Ok(profile);
  }

  [HttpPut("me")]
  public async Task<IActionResult> UpdateMe([FromBody] UserProfileUpdateRequest request)
  {
    var userIdClaim = User.FindFirstValue(ClaimTypes.NameIdentifier);
    if (!int.TryParse(userIdClaim, out var userId))
      return Unauthorized();

    var updated = await _userService.UpdateMyProfileAsync(userId, request);
    if (updated == null) return NotFound();

    return Ok(updated);
  }

  [HttpPost("me/profile-image")]
  public async Task<IActionResult> UploadMyProfileImage(IFormFile? file)
  {
    var userIdClaim = User.FindFirstValue(ClaimTypes.NameIdentifier);
    if (!int.TryParse(userIdClaim, out var userId))
      return Unauthorized();

    if (file == null)
    {
      return BadRequest("Image file is required.");
    }

    await using var stream = file.OpenReadStream();
    var publicBaseUrl = UriHelper.BuildAbsolute(Request.Scheme, Request.Host, Request.PathBase);
    var updated = await _userService.UpdateMyProfileImageAsync(
      userId,
      new UserProfileImageUploadRequest
      {
        Content = stream,
        FileName = file.FileName,
        ContentType = file.ContentType,
        Length = file.Length,
      },
      publicBaseUrl,
      HttpContext.RequestAborted);

    if (updated == null)
    {
      return NotFound();
    }

    return Ok(updated);
  }

  [HttpDelete("me")]
  public async Task<IActionResult> DeleteMe()
  {
    var userIdClaim = User.FindFirstValue(ClaimTypes.NameIdentifier);
    if (!int.TryParse(userIdClaim, out var userId))
      return Unauthorized();

    var deleted = await _userService.DeleteMyAccountAsync(userId);
    if (!deleted) return NotFound();

    Response.Cookies.Delete("jwt");
    Response.Cookies.Delete("refresh_token");
    return NoContent();
  }

  [HttpDelete("me/linked-accounts/{provider}")]
  public async Task<IActionResult> UnlinkProvider(string provider)
  {
    var userIdClaim = User.FindFirstValue(ClaimTypes.NameIdentifier);
    if (!int.TryParse(userIdClaim, out var userId))
      return Unauthorized();

    var unlinked = await _userService.UnlinkProviderAsync(userId, provider.ToLowerInvariant());
    return unlinked ? NoContent() : NotFound();
  }

  [HttpGet("{id:int}")]
  public async Task<IActionResult> GetById(int id)
  {
    var user = await _userService.GetByIdAsync(id);
    if (user == null)
    {
      return NotFound();
    }

    return Ok(user);
  }

  [HttpPost]
  public async Task<IActionResult> Create([FromBody] UserCreateRequest request)
  {
    var created = await _userService.CreateAsync(request);
    return CreatedAtAction(nameof(GetById), new { id = created.Id }, created);
  }

  [HttpPut("{id:int}")]
  public async Task<IActionResult> Update(int id, [FromBody] UserUpdateRequest request)
  {
    var updated = await _userService.UpdateAsync(id, request);
    if (updated == null)
    {
      return NotFound();
    }

    return Ok(updated);
  }

  [HttpGet("search")]
  public async Task<IActionResult> Search([FromQuery] string q)
  {
    if (string.IsNullOrWhiteSpace(q) || q.Length < 2)
    {
      return Ok(new List<object>());
    }

    var users = await _userService.SearchAsync(q);
    return Ok(users.Select(u => new
    {
      userId = u.Id,
      u.DisplayName,
      u.Username,
      u.ProfilePictureUrl
    }));
  }

  [HttpGet("{username}")]
  public async Task<IActionResult> GetByUsername(string username)
  {
    var user = await _userService.GetByUsernameAsync(username);
    if (user == null)
    {
      return NotFound();
    }

    return Ok(new
    {
      userId = user.Id,
      user.DisplayName,
      user.Username,
      user.ProfilePictureUrl,
      user.CreatedAt
    });
  }

  [HttpDelete("{id:int}")]
  [Authorize(Roles = "Admin")]
  public async Task<IActionResult> Delete(int id)
  {
    var deleted = await _userService.DeleteAsync(id);
    return deleted ? NoContent() : NotFound();
  }
}
