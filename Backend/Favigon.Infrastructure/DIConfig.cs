using Favigon.Application.Interfaces;
using Favigon.Infrastructure.Context;
using Favigon.Infrastructure.External.AI;
using Favigon.Infrastructure.External.Assets;
using Favigon.Infrastructure.External.Email;
using Favigon.Infrastructure.External.OAuth;
using Favigon.Infrastructure.Logging;
using Favigon.Infrastructure.Repositories;
using Favigon.Infrastructure.Seeding;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using System.Net.Http.Headers;

namespace Favigon.Infrastructure;

public static class ServiceCollectionExtensions
{
  public static IServiceCollection AddInfrastructure(this IServiceCollection services, IConfiguration configuration)
  {
    services.AddDbContext<FavigonDbContext>(options =>
      options.UseNpgsql(configuration.GetConnectionString("FavigonDb")));

    services.AddScoped<IUserRepository, UserRepository>();
    services.AddScoped<ILinkedAccountRepository, LinkedAccountRepository>();
    services.AddScoped<IProjectRepository, ProjectRepository>();
    services.AddScoped<IFollowRepository, FollowRepository>();
    services.AddScoped<IBookmarkRepository, BookmarkRepository>();
    services.AddScoped<ILikeRepository, LikeRepository>();
    services.AddScoped<IExploreRepository, ExploreRepository>();
    services.AddScoped<ProjectAssetStorage>();
    services.AddScoped<IProjectAssetStorage>(sp => sp.GetRequiredService<ProjectAssetStorage>());
    services.AddScoped<IUserProfileImageStorage>(sp => sp.GetRequiredService<ProjectAssetStorage>());
    services.AddScoped<IAuditLogger, AuditLogger>();

    services.AddHttpClient<IGithubOAuthClient, GithubOAuthClient>(client =>
    {
      client.DefaultRequestHeaders.UserAgent.Add(new ProductInfoHeaderValue("Favigon", "1.0"));
      client.DefaultRequestHeaders.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));
    });

    services.AddHttpClient<IGoogleOAuthClient, GoogleOAuthClient>();
    services.AddScoped<IEmailSender, SmtpEmailSender>();

    services.AddHttpClient<IAiClient, OpenAiClient>(client =>
    {
      client.Timeout = TimeSpan.FromSeconds(120);
    });

    return services;
  }

  public static async Task SeedInfrastructureAsync(this IServiceProvider serviceProvider)
  {
    using var scope = serviceProvider.CreateScope();
    var dbContext = scope.ServiceProvider.GetRequiredService<FavigonDbContext>();
    await dbContext.Database.MigrateAsync();
    await UserSeeder.SeedAsync(dbContext);
    await ProjectSeeder.SeedAsync(dbContext);
  }

}
