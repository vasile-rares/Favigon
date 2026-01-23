using DevBox.Application.Interfaces;
using AppDbContext = DevBox.Infrastructure.Context.DbContext;
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
    services.AddDbContext<AppDbContext>(options =>
      options.UseSqlServer(configuration.GetConnectionString("DevBoxDb")));

    services.AddScoped<IUserRepository, UserRepository>();

    return services;
  }

  public static async Task SeedInfrastructureAsync(this IServiceProvider serviceProvider)
  {
    using var scope = serviceProvider.CreateScope();
    var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    await UserSeeder.SeedAsync(dbContext);
  }

}
