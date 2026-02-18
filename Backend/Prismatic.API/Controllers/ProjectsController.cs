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

  [HttpGet("{id:int}/files")]
  public async Task<IActionResult> GetFiles(int id)
  {
    var userIdValue = User.FindFirstValue(ClaimTypes.NameIdentifier);
    if (!int.TryParse(userIdValue, out var userId))
    {
      return Unauthorized();
    }

    var files = await _projectService.GetFilesAsync(id, userId);
    if (files == null)
    {
      return NotFound();
    }

    return Ok(files);
  }

  [HttpGet("{id:int}/files/content")]
  public async Task<IActionResult> GetFileContent(int id, [FromQuery] string path)
  {
    var userIdValue = User.FindFirstValue(ClaimTypes.NameIdentifier);
    if (!int.TryParse(userIdValue, out var userId))
    {
      return Unauthorized();
    }

    var fileContent = await _projectService.GetFileContentAsync(id, userId, path);
    if (fileContent == null)
    {
      return NotFound();
    }

    return Ok(fileContent);
  }

  [HttpPut("{id:int}/files/content")]
  [HttpPost("{id:int}/files/content")]
  public async Task<IActionResult> UpdateFileContent(
    int id,
    [FromBody] ProjectFileUpdateRequest request)
  {
    var userIdValue = User.FindFirstValue(ClaimTypes.NameIdentifier);
    if (!int.TryParse(userIdValue, out var userId))
    {
      return Unauthorized();
    }

    if (request == null || string.IsNullOrWhiteSpace(request.Path))
    {
      return BadRequest();
    }

    var updated = await _projectService.UpdateFileContentAsync(id, userId, request);
    return updated ? NoContent() : NotFound();
  }

}
