using Favigon.Application.Interfaces;
using Favigon.Application.Mappings;
using Favigon.Application.Services;
using Favigon.Converter;
using Microsoft.Extensions.DependencyInjection;

namespace Favigon.Application;

public static class ServiceCollectionExtensions
{
  public static IServiceCollection AddApplication(this IServiceCollection services)
  {
    services.AddAutoMapper(typeof(MappingProfile).Assembly);
    services.AddScoped<IUserService, UserService>();
    services.AddScoped<IAuthService, AuthService>();
    services.AddScoped<IProjectService, ProjectService>();
    services.AddScoped<IConverterService, ConverterService>();
    services.AddFavigonConverter();

    return services;
  }
}
