using DevBox.Application.Interfaces;
using DevBox.Application.Services;
using Microsoft.Extensions.DependencyInjection;

namespace DevBox.Application;

public static class ServiceCollectionExtensions
{
  public static IServiceCollection AddApplication(this IServiceCollection services)
  {
    services.AddScoped<IUserService, UserService>();
    return services;
  }
}
