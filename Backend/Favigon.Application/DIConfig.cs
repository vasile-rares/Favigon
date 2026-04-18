using Favigon.Application.Interfaces;
using Favigon.Application.Mappings;
using Favigon.Application.Services;
using Favigon.Converter;
using FluentValidation;
using Microsoft.Extensions.DependencyInjection;

namespace Favigon.Application;

public static class ServiceCollectionExtensions
{
  public static IServiceCollection AddApplication(this IServiceCollection services)
  {
    services.AddAutoMapper(cfg => cfg.AddMaps(typeof(MappingProfile).Assembly));
    services.AddValidatorsFromAssemblyContaining<MappingProfile>();
    services.AddScoped<IUserService, UserService>();
    services.AddScoped<IAuthService, AuthService>();
    services.AddScoped<IProjectService, ProjectService>();
    services.AddScoped<IProjectAssetService, ProjectAssetService>();
    services.AddScoped<IConverterService, ConverterService>();
    services.AddFavigonConverter();

    return services;
  }
}
