using Prismatic.Converter.Abstractions;
using Microsoft.Extensions.DependencyInjection;

namespace Prismatic.Converter;

public static class ServiceCollectionExtensions
{
  public static IServiceCollection AddPrismaticConverter(this IServiceCollection services)
  {
    services.AddScoped<IConverterEngine, ConverterEngine>();

    return services;
  }
}
