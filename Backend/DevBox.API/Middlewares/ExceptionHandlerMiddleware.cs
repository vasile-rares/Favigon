using System.Net;
using System.Text.Json;
using Microsoft.AspNetCore.Mvc;

namespace DevBox.API.Middlewares;

public class ExceptionHandlerMiddleware
{
  private readonly RequestDelegate _next;
  private readonly ILogger<ExceptionHandlerMiddleware> _logger;
  private readonly IHostEnvironment _environment;

  public ExceptionHandlerMiddleware(
      RequestDelegate next,
      ILogger<ExceptionHandlerMiddleware> logger,
      IHostEnvironment environment)
  {
    _next = next;
    _logger = logger;
    _environment = environment;
  }

  public async Task InvokeAsync(HttpContext context)
  {
    try
    {
      await _next(context);
    }
    catch (Exception ex)
    {
      _logger.LogError(ex, "Unhandled exception");
      await HandleExceptionAsync(context, ex, _environment.IsDevelopment());
    }
  }

  private static async Task HandleExceptionAsync(HttpContext context, Exception exception, bool includeDetails)
  {
    var statusCode = exception switch
    {
      InvalidOperationException => (int)HttpStatusCode.Conflict,
      ArgumentException => (int)HttpStatusCode.BadRequest,
      _ => (int)HttpStatusCode.InternalServerError
    };

    var problem = new ProblemDetails
    {
      Status = statusCode,
      Title = statusCode == (int)HttpStatusCode.InternalServerError
            ? "An unexpected error occurred."
            : exception.Message,
      Detail = includeDetails ? exception.ToString() : null
    };

    context.Response.Clear();
    context.Response.StatusCode = statusCode;
    context.Response.ContentType = "application/json";

    var json = JsonSerializer.Serialize(problem);
    await context.Response.WriteAsync(json);
  }
}

