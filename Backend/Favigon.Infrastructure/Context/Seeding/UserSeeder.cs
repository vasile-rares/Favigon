using Favigon.Domain.Entities;
using Favigon.Infrastructure.Context;
using Microsoft.EntityFrameworkCore;

namespace Favigon.Infrastructure.Seeding;

public static class UserSeeder
{
  public static async Task SeedAsync(FavigonDbContext context)
  {
    await context.Database.MigrateAsync();

    var seed = new[]
    {
      new User { DisplayName = "Admin",          Username = "admin",          Email = "admin@Favigon.local",         PasswordHash = BCrypt.Net.BCrypt.HashPassword("Admin123!"),    Role = "Admin", ProfilePictureUrl = null },
      new User { DisplayName = "User",           Username = "user",           Email = "user@Favigon.local",          PasswordHash = BCrypt.Net.BCrypt.HashPassword("User123!"),     Role = "User",  ProfilePictureUrl = null },
      new User { DisplayName = "Sofia Andersen", Username = "sofia_andersen", Email = "sofia.andersen@demo.local",   PasswordHash = BCrypt.Net.BCrypt.HashPassword("xP9#mK2!qLw"), Role = "User",  ProfilePictureUrl = "https://api.dicebear.com/9.x/adventurer/svg?seed=sofia_andersen" },
      new User { DisplayName = "Lucas Müller",   Username = "lucas_muller",   Email = "lucas.muller@demo.local",     PasswordHash = BCrypt.Net.BCrypt.HashPassword("rT4$vN8!dHz"), Role = "User",  ProfilePictureUrl = "https://api.dicebear.com/9.x/adventurer/svg?seed=lucas_muller" },
      new User { DisplayName = "Aisha Rahman",   Username = "aisha_rahman",   Email = "aisha.rahman@demo.local",     PasswordHash = BCrypt.Net.BCrypt.HashPassword("kW3@jY6!nBs"), Role = "User",  ProfilePictureUrl = "https://api.dicebear.com/9.x/adventurer/svg?seed=aisha_rahman" },
      new User { DisplayName = "Marco Esposito", Username = "marco_esposito", Email = "marco.esposito@demo.local",   PasswordHash = BCrypt.Net.BCrypt.HashPassword("zL7!cQ1#fMt"), Role = "User",  ProfilePictureUrl = "https://api.dicebear.com/9.x/adventurer/svg?seed=marco_esposito" },
      new User { DisplayName = "Yuki Tanaka",    Username = "yuki_tanaka",    Email = "yuki.tanaka@demo.local",      PasswordHash = BCrypt.Net.BCrypt.HashPassword("hA5#wE9!pRv"), Role = "User",  ProfilePictureUrl = "https://api.dicebear.com/9.x/adventurer/svg?seed=yuki_tanaka" },
      new User { DisplayName = "Emma Johansson", Username = "emma_johansson", Email = "emma.johansson@demo.local",   PasswordHash = BCrypt.Net.BCrypt.HashPassword("bX2$uD4!mNq"), Role = "User",  ProfilePictureUrl = "https://api.dicebear.com/9.x/adventurer/svg?seed=emma_johansson" },
      new User { DisplayName = "Noah Bergmann",  Username = "noah_bergmann",  Email = "noah.bergmann@demo.local",    PasswordHash = BCrypt.Net.BCrypt.HashPassword("sG8@yK0!cJr"), Role = "User",  ProfilePictureUrl = "https://api.dicebear.com/9.x/adventurer/svg?seed=noah_bergmann" },
      new User { DisplayName = "Camille Dubois", Username = "camille_dubois", Email = "camille.dubois@demo.local",   PasswordHash = BCrypt.Net.BCrypt.HashPassword("oV6!tF3#lWx"), Role = "User",  ProfilePictureUrl = "https://api.dicebear.com/9.x/adventurer/svg?seed=camille_dubois" },
      new User { DisplayName = "Liam O'Brien",   Username = "liam_obrien",    Email = "liam.obrien@demo.local",      PasswordHash = BCrypt.Net.BCrypt.HashPassword("nQ1$aH7!eZp"), Role = "User",  ProfilePictureUrl = "https://api.dicebear.com/9.x/adventurer/svg?seed=liam_obrien" },
      new User { DisplayName = "Priya Sharma",   Username = "priya_sharma",   Email = "priya.sharma@demo.local",     PasswordHash = BCrypt.Net.BCrypt.HashPassword("dM9#iS5!bCk"), Role = "User",  ProfilePictureUrl = "https://api.dicebear.com/9.x/adventurer/svg?seed=priya_sharma" },
    };

    var existingUsernames = await context.Users
      .Select(u => u.Username)
      .ToHashSetAsync();

    var toAdd = seed.Where(u => !existingUsernames.Contains(u.Username)).ToList();
    if (toAdd.Count > 0)
    {
      context.Users.AddRange(toAdd);
      await context.SaveChangesAsync();
    }
  }
}
