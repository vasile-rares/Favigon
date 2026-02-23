using System.Xml.Linq;
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

      var userSecretsId = GetApiUserSecretsId(apiPath);
      var userSecretsPath = GetUserSecretsPath(userSecretsId);

      var config = new ConfigurationBuilder()
          .SetBasePath(apiPath)
          .AddJsonFile("appsettings.json", optional: false, reloadOnChange: true)
          .AddJsonFile("appsettings.Development.json", optional: true)
          .AddJsonFile(userSecretsPath, optional: true, reloadOnChange: false)
          .AddEnvironmentVariables()
          .Build();

      var connectionString = config.GetConnectionString("PrismaticDb");
      if (string.IsNullOrWhiteSpace(connectionString))
      {
        throw new InvalidOperationException(
            "Connection string 'PrismaticDb' was not found. Configure 'ConnectionStrings:PrismaticDb' in Prismatic.API user secrets, environment variables, or appsettings.");
      }

      var optionsBuilder = new DbContextOptionsBuilder<PrismaticDbContext>();
      optionsBuilder.UseNpgsql(connectionString);

      return new PrismaticDbContext(optionsBuilder.Options);
    }

    private static string GetApiUserSecretsId(string apiPath)
    {
      var csprojPath = Path.Combine(apiPath, "Prismatic.API.csproj");
      if (!File.Exists(csprojPath))
      {
        throw new InvalidOperationException($"Could not find API project file at '{csprojPath}'.");
      }

      var doc = XDocument.Load(csprojPath);
      var userSecretsId = doc
          .Descendants("UserSecretsId")
          .Select(x => x.Value?.Trim())
          .FirstOrDefault(x => !string.IsNullOrWhiteSpace(x));

      if (string.IsNullOrWhiteSpace(userSecretsId))
      {
        throw new InvalidOperationException("UserSecretsId was not found in Prismatic.API.csproj.");
      }

      return userSecretsId;
    }

    private static string GetUserSecretsPath(string userSecretsId)
    {
      var appData = Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData);
      if (!string.IsNullOrWhiteSpace(appData))
      {
        return Path.Combine(appData, "Microsoft", "UserSecrets", userSecretsId, "secrets.json");
      }

      var home = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);
      return Path.Combine(home, ".microsoft", "usersecrets", userSecretsId, "secrets.json");
    }
  }
}
