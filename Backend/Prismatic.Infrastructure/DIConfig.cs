using Prismatic.Application.Interfaces;
using Prismatic.Application.Registry;
using Prismatic.Infrastructure.Context;
using Prismatic.Infrastructure.Generators.Angular;
using Prismatic.Infrastructure.Generators.Html;
using Prismatic.Infrastructure.Generators.React;
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
    services.AddScoped<IProjectRepository, ProjectRepository>();

    // Converter — singleton because registries are configured once at startup
    services.AddSingleton<ComponentRegistry>(sp =>
    {
      var registry = new ComponentRegistry();
      registry.RegisterFramework(new HtmlRegistry());
      registry.RegisterFramework(new ReactRegistry());
      registry.RegisterFramework(new AngularRegistry());
      return registry;
    });

    return services;
  }

  public static async Task SeedInfrastructureAsync(this IServiceProvider serviceProvider)
  {
    using var scope = serviceProvider.CreateScope();
    var dbContext = scope.ServiceProvider.GetRequiredService<PrismaticDbContext>();
    await UserSeeder.SeedAsync(dbContext);
  }

}
