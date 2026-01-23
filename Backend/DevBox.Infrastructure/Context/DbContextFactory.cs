using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;
using Microsoft.Extensions.Configuration;

namespace DevBox.Infrastructure.Context
{
    public class DbContextFactory : IDesignTimeDbContextFactory<DevBoxDbContext>
    {
        public DevBoxDbContext CreateDbContext(string[] args)
        {
            var basePath = Path.Combine(Directory.GetCurrentDirectory(), "../DevBox.API");

            var config = new ConfigurationBuilder()
                .SetBasePath(basePath)
                .AddJsonFile("appsettings.json", optional: false, reloadOnChange: true)
                .AddJsonFile("appsettings.Development.json", optional: true)
                .AddEnvironmentVariables()
                .Build();

            var connectionString = config.GetConnectionString("DevBoxDb");

            var optionsBuilder = new DbContextOptionsBuilder<DevBoxDbContext>();
            optionsBuilder.UseSqlServer(connectionString);

            return new DevBoxDbContext(optionsBuilder.Options);
        }
    }
}
