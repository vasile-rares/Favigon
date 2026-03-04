using Prismatic.Application.Interfaces;
using Prismatic.Application.Mappings;
using Prismatic.Application.Services;
using Prismatic.Converter;
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
    services.AddScoped<IConverterService, ConverterService>();
    services.AddPrismaticConverter();

    return services;
  }
}
