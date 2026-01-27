using DevBox.Application.Interfaces;
using DevBox.Application.Mappings;
using DevBox.Application.Services;
using Microsoft.Extensions.DependencyInjection;

namespace DevBox.Application;

public static class ServiceCollectionExtensions
{
  public static IServiceCollection AddApplication(this IServiceCollection services)
  {
    services.AddAutoMapper(typeof(MappingProfile).Assembly);
    services.AddScoped<IUserService, UserService>();
    services.AddScoped<IAuthService, AuthService>();
    services.AddScoped<IProjectService, ProjectService>();
    return services;
  }
}
