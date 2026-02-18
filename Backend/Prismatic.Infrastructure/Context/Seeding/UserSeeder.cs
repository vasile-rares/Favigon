using Prismatic.Domain.Entities;
using Prismatic.Infrastructure.Context;
using Microsoft.EntityFrameworkCore;

namespace Prismatic.Infrastructure.Seeding;

public static class UserSeeder
{
  public static async Task SeedAsync(PrismaticDbContext context)
  {
    await context.Database.EnsureCreatedAsync();

    if (!await context.Users.AnyAsync())
    {
      context.Users.AddRange(
          new User
          {
            DisplayName = "Admin",
            Username = "admin",
            Email = "admin@Prismatic.local",
            PasswordHash = BCrypt.Net.BCrypt.HashPassword("Admin123!"),
            Role = "Admin",
            ProfilePictureUrl = null
          },
          new User
          {
            DisplayName = "User",
            Username = "user",
            Email = "user@Prismatic.local",
            PasswordHash = BCrypt.Net.BCrypt.HashPassword("User123!"),
            Role = "User",
            ProfilePictureUrl = null
          }
      );

      await context.SaveChangesAsync();
    }
  }
}
