using Microsoft.Extensions.DependencyInjection;

namespace DevBox.Application;

public static class ServiceCollectionExtensions
{
  public static IServiceCollection AddApplication(this IServiceCollection services)
  {
    // Register application services here
    return services;
  }
}
