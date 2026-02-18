using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;
using Microsoft.Extensions.Configuration;

namespace Prismatic.Infrastructure.Context
{
    public class DbContextFactory : IDesignTimeDbContextFactory<PrismaticDbContext>
    {
        public PrismaticDbContext CreateDbContext(string[] args)
        {
            var basePath = Path.Combine(Directory.GetCurrentDirectory(), "../Prismatic.API");

            var config = new ConfigurationBuilder()
                .SetBasePath(basePath)
                .AddJsonFile("appsettings.json", optional: false, reloadOnChange: true)
                .AddJsonFile("appsettings.Development.json", optional: true)
                .AddEnvironmentVariables()
                .Build();

            var connectionString = config.GetConnectionString("PrismaticDb");

            var optionsBuilder = new DbContextOptionsBuilder<PrismaticDbContext>();
            optionsBuilder.UseSqlServer(connectionString);

            return new PrismaticDbContext(optionsBuilder.Options);
        }
    }
}
