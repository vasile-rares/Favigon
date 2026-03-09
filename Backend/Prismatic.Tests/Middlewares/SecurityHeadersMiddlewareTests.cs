using Microsoft.AspNetCore.Http;
using Prismatic.API.Middlewares;

namespace Prismatic.Tests.Middlewares;

public class SecurityHeadersMiddlewareTests
{
  private static DefaultHttpContext BuildContext()
  {
    var ctx = new DefaultHttpContext();
    // Use an in-memory response body to satisfy the middleware pipeline
    ctx.Response.Body = new MemoryStream();
    return ctx;
  }

  [Fact]
  public async Task InvokeAsync_SetsXContentTypeOptionsHeader()
  {
    // Arrange
    var ctx = BuildContext();
    var middleware = new SecurityHeadersMiddleware(_ => Task.CompletedTask);

    // Act
    await middleware.InvokeAsync(ctx);

    // Assert
    Assert.Equal("nosniff", ctx.Response.Headers["X-Content-Type-Options"].ToString());
  }

  [Fact]
  public async Task InvokeAsync_SetsXFrameOptionsHeader()
  {
    var ctx = BuildContext();
    var middleware = new SecurityHeadersMiddleware(_ => Task.CompletedTask);

    await middleware.InvokeAsync(ctx);

    Assert.Equal("DENY", ctx.Response.Headers["X-Frame-Options"].ToString());
  }

  [Fact]
  public async Task InvokeAsync_SetsReferrerPolicyHeader()
  {
    var ctx = BuildContext();
    var middleware = new SecurityHeadersMiddleware(_ => Task.CompletedTask);

    await middleware.InvokeAsync(ctx);

    Assert.Equal("strict-origin-when-cross-origin", ctx.Response.Headers["Referrer-Policy"].ToString());
  }

  [Fact]
  public async Task InvokeAsync_SetsPermissionsPolicyHeader()
  {
    var ctx = BuildContext();
    var middleware = new SecurityHeadersMiddleware(_ => Task.CompletedTask);

    await middleware.InvokeAsync(ctx);

    Assert.Equal("camera=(), microphone=(), geolocation=()", ctx.Response.Headers["Permissions-Policy"].ToString());
  }

  [Fact]
  public async Task InvokeAsync_SetsXXSSProtectionHeader()
  {
    var ctx = BuildContext();
    var middleware = new SecurityHeadersMiddleware(_ => Task.CompletedTask);

    await middleware.InvokeAsync(ctx);

    Assert.Equal("0", ctx.Response.Headers["X-XSS-Protection"].ToString());
  }

  [Fact]
  public async Task InvokeAsync_CallsNextMiddleware()
  {
    // Arrange
    var nextCalled = false;
    var ctx = BuildContext();
    var middleware = new SecurityHeadersMiddleware(_ =>
    {
      nextCalled = true;
      return Task.CompletedTask;
    });

    // Act
    await middleware.InvokeAsync(ctx);

    // Assert
    Assert.True(nextCalled);
  }
}
