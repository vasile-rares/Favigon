using Prismatic.Application.Interfaces;
using Prismatic.Infrastructure.Context;
using Prismatic.Infrastructure.Repositories;
using Prismatic.Infrastructure.Seeding;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace Prismatic.Infrastructure;

public static class ServiceCollectionExtensions
{
  public static IServiceCollection AddInfrastructure(this IServiceCollection services, IConfiguration configuration)
  {
    services.AddDbContext<PrismaticDbContext>(options =>
      options.UseNpgsql(configuration.GetConnectionString("PrismaticDb")));

    services.AddScoped<IUserRepository, UserRepository>();
    services.AddScoped<IAccountProviderRepository, AccountProviderRepository>();
    services.AddScoped<IProjectRepository, ProjectRepository>();

    return services;
  }

  public static async Task SeedInfrastructureAsync(this IServiceProvider serviceProvider)
  {
    using var scope = serviceProvider.CreateScope();
    var dbContext = scope.ServiceProvider.GetRequiredService<PrismaticDbContext>();
    await UserSeeder.SeedAsync(dbContext);
  }

}
