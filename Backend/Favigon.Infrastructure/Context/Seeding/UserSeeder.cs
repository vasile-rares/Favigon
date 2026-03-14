using Favigon.Domain.Entities;
using Favigon.Infrastructure.Context;
using Microsoft.EntityFrameworkCore;

namespace Favigon.Infrastructure.Seeding;

public static class UserSeeder
{
  public static async Task SeedAsync(FavigonDbContext context)
  {
    await context.Database.MigrateAsync();

    if (!await context.Users.AnyAsync())
    {
      context.Users.AddRange(
          new User
          {
            DisplayName = "Admin",
            Username = "admin",
            Email = "admin@Favigon.local",
            PasswordHash = BCrypt.Net.BCrypt.HashPassword("Admin123!"),
            Role = "Admin",
            ProfilePictureUrl = null
          },
          new User
          {
            DisplayName = "User",
            Username = "user",
            Email = "user@Favigon.local",
            PasswordHash = BCrypt.Net.BCrypt.HashPassword("User123!"),
            Role = "User",
            ProfilePictureUrl = null
          }
      );

      await context.SaveChangesAsync();
    }
  }
}
