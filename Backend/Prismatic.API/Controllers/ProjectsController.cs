using Prismatic.Application.DTOs.Requests;
using Prismatic.Application.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Security.Claims;

namespace Prismatic.API.Controllers;

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
  public async Task<IActionResult> GetAll()
  {
    var userIdValue = User.FindFirstValue(ClaimTypes.NameIdentifier);
    if (!int.TryParse(userIdValue, out var userId))
    {
      return Unauthorized();
    }

    var projects = await _projectService.GetByUserIdAsync(userId);
    return Ok(projects);
  }

  [HttpGet("{id:int}")]
  public async Task<IActionResult> GetById(int id)
  {
    var userIdValue = User.FindFirstValue(ClaimTypes.NameIdentifier);
    if (!int.TryParse(userIdValue, out var userId))
    {
      return Unauthorized();
    }

    var project = await _projectService.GetByIdAsync(id, userId);
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
    var userIdValue = User.FindFirstValue(ClaimTypes.NameIdentifier);
    if (!int.TryParse(userIdValue, out var userId))
    {
      return Unauthorized();
    }

    var updated = await _projectService.UpdateAsync(id, request, userId);
    if (updated == null)
    {
      return NotFound();
    }

    return Ok(updated);
  }

  [HttpDelete("{id:int}")]
  public async Task<IActionResult> Delete(int id)
  {
    var userIdValue = User.FindFirstValue(ClaimTypes.NameIdentifier);
    if (!int.TryParse(userIdValue, out var userId))
    {
      return Unauthorized();
    }

    var deleted = await _projectService.DeleteAsync(id, userId);
    return deleted ? NoContent() : NotFound();
  }

  [HttpGet("{id:int}/design")]
  public async Task<IActionResult> GetDesign(int id)
  {
    var userIdValue = User.FindFirstValue(ClaimTypes.NameIdentifier);
    if (!int.TryParse(userIdValue, out var userId))
    {
      return Unauthorized();
    }

    var design = await _projectService.GetDesignByProjectIdAsync(id, userId);
    if (design == null)
    {
      return NotFound();
    }

    return Ok(design);
  }

  [HttpPut("{id:int}/design")]
  public async Task<IActionResult> SaveDesign(int id, [FromBody] ProjectDesignSaveRequest request)
  {
    var userIdValue = User.FindFirstValue(ClaimTypes.NameIdentifier);
    if (!int.TryParse(userIdValue, out var userId))
    {
      return Unauthorized();
    }

    var saved = await _projectService.SaveDesignAsync(id, userId, request);
    if (saved == null)
    {
      return NotFound();
    }

    return Ok(saved);
  }

  [HttpGet("user/{userId:int}")]
  public async Task<IActionResult> GetPublicByUserId(int userId)
  {
    var projects = await _projectService.GetByUserIdAsync(userId, isPublic: true);
    return Ok(projects);
  }

}
