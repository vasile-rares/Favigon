using DevBox.Application.Interfaces;
using DevBox.Domain.Entities;
using Microsoft.AspNetCore.Mvc;

namespace DevBox.API.Controllers;

[ApiController]
[Route("api/[controller]")]
public class UsersController : ControllerBase
{
  private readonly IUserService _userService;

  public UsersController(IUserService userService)
  {
    _userService = userService;
  }

  [HttpGet]
  public async Task<ActionResult<IReadOnlyList<User>>> GetAll()
  {
    var users = await _userService.GetAllAsync();
    return Ok(users);
  }

  [HttpGet("{id:int}")]
  public async Task<ActionResult<User>> GetById(int id)
  {
    var user = await _userService.GetByIdAsync(id);
    if (user == null)
    {
      return NotFound();
    }

    return Ok(user);
  }

  [HttpPost]
  public async Task<ActionResult<User>> Create([FromBody] User user)
  {
    var created = await _userService.CreateAsync(user);
    return CreatedAtAction(nameof(GetById), new { id = created.Id }, created);
  }

  [HttpPut("{id:int}")]
  public async Task<ActionResult<User>> Update(int id, [FromBody] User user)
  {
    var updated = await _userService.UpdateAsync(id, user);
    if (updated == null)
    {
      return NotFound();
    }

    return Ok(updated);
  }

  [HttpDelete("{id:int}")]
  public async Task<IActionResult> Delete(int id)
  {
    var deleted = await _userService.DeleteAsync(id);
    return deleted ? NoContent() : NotFound();
  }
}
