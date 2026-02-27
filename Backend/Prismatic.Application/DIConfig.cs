using Prismatic.Application.Pipeline;
using Prismatic.Application.Registry;
using Prismatic.Application.Interfaces;
using Prismatic.Application.Mappings;
using Prismatic.Application.Services;
using Microsoft.Extensions.DependencyInjection;

namespace Prismatic.Application;

public static class ServiceCollectionExtensions
{
  public static IServiceCollection AddApplication(this IServiceCollection services)
  {
    services.AddAutoMapper(typeof(MappingProfile).Assembly);
    services.AddScoped<IUserService, UserService>();
    services.AddScoped<IAuthService, AuthService>();
    services.AddScoped<IProjectService, ProjectService>();

    services.AddSingleton<CodeGenerationPipeline>();

    return services;
  }
}
