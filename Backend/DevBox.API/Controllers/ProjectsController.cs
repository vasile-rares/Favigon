using DevBox.Application.DTOs.Requests;
using DevBox.Application.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Security.Claims;

namespace DevBox.API.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class ProjectsController : ControllerBase
{
  private readonly IProjectService _projectService;

  public ProjectsController(IProjectService projectService)
  {
    _projectService = projectService;
  }

  [HttpGet]
  public async Task<IActionResult> GetAll([FromQuery] int? userId)
  {
    var projects = userId.HasValue
      ? await _projectService.GetByUserIdAsync(userId.Value)
      : await _projectService.GetAllAsync();

    return Ok(projects);
  }

  [HttpGet("{id:int}")]
  public async Task<IActionResult> GetById(int id)
  {
    var project = await _projectService.GetByIdAsync(id);
    if (project == null)
    {
      return NotFound();
    }

    return Ok(project);
  }

  [HttpPost]
  public async Task<IActionResult> Create([FromBody] ProjectCreateRequest request)
  {
    var userIdValue = User.FindFirstValue(ClaimTypes.NameIdentifier);
    if (!int.TryParse(userIdValue, out var userId))
    {
      return Unauthorized();
    }

    var created = await _projectService.CreateAsync(request, userId);
    return CreatedAtAction(nameof(GetById), new { id = created.ProjectId }, created);
  }

  [HttpPut("{id:int}")]
  public async Task<IActionResult> Update(int id, [FromBody] ProjectUpdateRequest request)
  {
    var updated = await _projectService.UpdateAsync(id, request);
    if (updated == null)
    {
      return NotFound();
    }

    return Ok(updated);
  }

  [HttpDelete("{id:int}")]
  public async Task<IActionResult> Delete(int id)
  {
    var deleted = await _projectService.DeleteAsync(id);
    return deleted ? NoContent() : NotFound();
  }

}
