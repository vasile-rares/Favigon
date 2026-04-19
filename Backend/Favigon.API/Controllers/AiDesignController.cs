using Favigon.Application.DTOs.Requests;
using Favigon.Application.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;

namespace Favigon.API.Controllers;

[ApiController]
[Route("api/ai")]
[Authorize]
[EnableRateLimiting("ai")]
public class AiDesignController(IAiDesignService aiDesignService) : ControllerBase
{
  [HttpPost("design")]
  public async Task<IActionResult> GenerateDesign(
      [FromBody] AiDesignRequest request,
      CancellationToken ct)
  {
    if (!ModelState.IsValid)
      return BadRequest(ModelState);

    var result = await aiDesignService.GenerateDesignAsync(request, ct);

    if (!result.Success)
      return UnprocessableEntity(new ProblemDetails
      {
        Status = 422,
        Title = result.Message ?? "Design generation failed."
      });

    return Ok(result);
  }

  [HttpPost("design/stream")]
  public async Task StreamDesign(
      [FromBody] AiDesignRequest request,
      CancellationToken ct)
  {
    if (!ModelState.IsValid)
    {
      Response.StatusCode = 400;
      return;
    }

    Response.ContentType = "text/event-stream";
    Response.Headers.CacheControl = "no-cache";
    Response.Headers.Connection = "keep-alive";

    try
    {
      await foreach (var evt in aiDesignService.GenerateDesignStreamingAsync(request, ct))
      {
        var data = evt.Data?.Replace("\n", "\\n") ?? "";
        await Response.WriteAsync($"event: {evt.Type}\ndata: {data}\n\n", ct);
        await Response.Body.FlushAsync(ct);
      }
    }
    catch (OperationCanceledException) { /* client disconnected */ }
    catch (Exception)
    {
      await Response.WriteAsync("event: error\ndata: AI service is temporarily unavailable.\n\n", ct);
      await Response.Body.FlushAsync(ct);
    }
  }
}
