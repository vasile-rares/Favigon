using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;
using Microsoft.Extensions.Configuration;

namespace Favigon.Infrastructure.Context
{
  public class DbContextFactory : IDesignTimeDbContextFactory<FavigonDbContext>
  {
    public FavigonDbContext CreateDbContext(string[] args)
    {
      var infrastructurePath = Directory.GetCurrentDirectory();
      var apiPath = Path.GetFullPath(Path.Combine(infrastructurePath, "../Favigon.API"));

      var config = new ConfigurationBuilder()
          .SetBasePath(apiPath)
          .AddJsonFile("appsettings.json", optional: false, reloadOnChange: true)
          .AddJsonFile("appsettings.Development.json", optional: true)
          .AddEnvironmentVariables()
          .Build();

      var connectionString = config.GetConnectionString("FavigonDb");
      if (string.IsNullOrWhiteSpace(connectionString))
      {
        throw new InvalidOperationException(
            "Connection string 'FavigonDb' was not found. Configure 'ConnectionStrings:FavigonDb' in Favigon.API appsettings.");
      }

      var optionsBuilder = new DbContextOptionsBuilder<FavigonDbContext>();
      optionsBuilder.UseNpgsql(connectionString);

      return new FavigonDbContext(optionsBuilder.Options);
    }
  }
}
