using DevBox.Application.Interfaces;
using DevBox.Infrastructure.Context;
using DevBox.Infrastructure.Repositories;
using DevBox.Infrastructure.Seeding;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace DevBox.Infrastructure;

public static class ServiceCollectionExtensions
{
  public static IServiceCollection AddInfrastructure(this IServiceCollection services, IConfiguration configuration)
  {
    services.AddDbContext<DevBoxDbContext>(options =>
      options.UseSqlServer(configuration.GetConnectionString("DevBoxDb")));

    services.AddScoped<IUserRepository, UserRepository>();
    services.AddScoped<IProjectRepository, ProjectRepository>();

    return services;
  }

  public static async Task SeedInfrastructureAsync(this IServiceProvider serviceProvider)
  {
    using var scope = serviceProvider.CreateScope();
    var dbContext = scope.ServiceProvider.GetRequiredService<DevBoxDbContext>();
    await UserSeeder.SeedAsync(dbContext);
  }

}
