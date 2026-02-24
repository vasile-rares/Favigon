using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;
using Microsoft.Extensions.Configuration;

namespace Prismatic.Infrastructure.Context
{
  public class DbContextFactory : IDesignTimeDbContextFactory<PrismaticDbContext>
  {
    public PrismaticDbContext CreateDbContext(string[] args)
    {
      var infrastructurePath = Directory.GetCurrentDirectory();
      var apiPath = Path.GetFullPath(Path.Combine(infrastructurePath, "../Prismatic.API"));

      var config = new ConfigurationBuilder()
          .SetBasePath(apiPath)
          .AddJsonFile("appsettings.json", optional: false, reloadOnChange: true)
          .AddJsonFile("appsettings.Development.json", optional: true)
          .AddEnvironmentVariables()
          .Build();

      var connectionString = config.GetConnectionString("PrismaticDb");
      if (string.IsNullOrWhiteSpace(connectionString))
      {
        throw new InvalidOperationException(
            "Connection string 'PrismaticDb' was not found. Configure 'ConnectionStrings:PrismaticDb' in Prismatic.API appsettings.");
      }

      var optionsBuilder = new DbContextOptionsBuilder<PrismaticDbContext>();
      optionsBuilder.UseNpgsql(connectionString);

      return new PrismaticDbContext(optionsBuilder.Options);
    }
  }
}
