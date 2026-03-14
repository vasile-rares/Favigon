using Favigon.Converter.Abstractions;
using Microsoft.Extensions.DependencyInjection;

namespace Favigon.Converter;

public static class ServiceCollectionExtensions
{
  public static IServiceCollection AddFavigonConverter(this IServiceCollection services)
  {
    services.AddScoped<IConverterEngine, ConverterEngine>();

    return services;
  }
}
