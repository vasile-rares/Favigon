using Prismatic.Application.DTOs.Requests;
using Prismatic.Application.Interfaces;
using Prismatic.Domain.Entities;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Security.Claims;

namespace Prismatic.API.Controllers;

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
    {
      return Unauthorized();
    }

    var user = await _userService.GetByIdAsync(userId);
    if (user == null)
    {
      return NotFound();
    }

    return Ok(new
    {
      user.Id,
      user.DisplayName,
      user.Username,
      user.Email,
      user.Role,
      user.ProfilePictureUrl
    });
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

  [HttpDelete("{id:int}")]
  [Authorize(Roles = "Admin")]
  public async Task<IActionResult> Delete(int id)
  {
    var deleted = await _userService.DeleteAsync(id);
    return deleted ? NoContent() : NotFound();
  }
}
