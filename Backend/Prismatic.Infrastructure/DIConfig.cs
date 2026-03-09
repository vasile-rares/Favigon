using Prismatic.Application.Interfaces;
using Prismatic.Infrastructure.Context;
using Prismatic.Infrastructure.External.Email;
using Prismatic.Infrastructure.External.OAuth;
using Prismatic.Infrastructure.Repositories;
using Prismatic.Infrastructure.Seeding;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using System.Net.Http.Headers;

namespace Prismatic.Infrastructure;

public static class ServiceCollectionExtensions
{
  public static IServiceCollection AddInfrastructure(this IServiceCollection services, IConfiguration configuration)
  {
    services.AddDbContext<PrismaticDbContext>(options =>
      options.UseNpgsql(configuration.GetConnectionString("PrismaticDb")));

    services.AddScoped<IUserRepository, UserRepository>();
    services.AddScoped<ILinkedAccountRepository, LinkedAccountRepository>();
    services.AddScoped<IProjectRepository, ProjectRepository>();

    services.AddHttpClient<IGithubOAuthClient, GithubOAuthClient>(client =>
    {
      client.DefaultRequestHeaders.UserAgent.Add(new ProductInfoHeaderValue("Prismatic", "1.0"));
      client.DefaultRequestHeaders.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));
    });

    services.AddHttpClient<IGoogleOAuthClient, GoogleOAuthClient>();
    services.AddScoped<IEmailSender, SmtpEmailSender>();

    return services;
  }

  public static async Task SeedInfrastructureAsync(this IServiceProvider serviceProvider)
  {
    using var scope = serviceProvider.CreateScope();
    var dbContext = scope.ServiceProvider.GetRequiredService<PrismaticDbContext>();
    await UserSeeder.SeedAsync(dbContext);
  }

}
