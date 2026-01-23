using DevBox.Domain.Entities;
using AppDbContext = DevBox.Infrastructure.Context.DbContext;
using Microsoft.EntityFrameworkCore;

namespace DevBox.Infrastructure.Seeding;

public static class UserSeeder
{
  public static async Task SeedAsync(AppDbContext context)
  {
    await context.Database.EnsureCreatedAsync();

    if (!await context.Users.AnyAsync())
    {
      context.Users.AddRange(
          new User
          {
            DisplayName = "Admin",
            Username = "admin",
            Email = "admin@devbox.local",
            PasswordHash = "Admin123!",
            Role = "Admin",
            ProfilePictureUrl = null
          },
          new User
          {
            DisplayName = "User",
            Username = "user",
            Email = "user@devbox.local",
            PasswordHash = "User123!",
            Role = "User",
            ProfilePictureUrl = null
          }
      );

      await context.SaveChangesAsync();
    }
  }
}
