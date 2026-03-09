using Microsoft.Extensions.Configuration;

namespace Prismatic.Tests.Helpers;

public static class TestConfiguration
{
  public const string JwtKey = "testkey_testkey_testkey_testkey_testkey_32chars!!";
  public const string JwtIssuer = "PrismaticAPI";
  public const string JwtAudience = "PrismaticClient";

  public static IConfiguration Build(Dictionary<string, string?>? overrides = null)
  {
    var settings = new Dictionary<string, string?>
    {
      ["JwtSettings:Key"] = JwtKey,
      ["JwtSettings:Issuer"] = JwtIssuer,
      ["JwtSettings:Audience"] = JwtAudience,
      ["JwtSettings:AccessTokenMinutes"] = "60",
      ["JwtSettings:RefreshTokenDays"] = "30",
      ["PasswordReset:TokenMinutes"] = "30",
      ["Client:BaseUrl"] = "https://localhost:4200",
    };

    if (overrides is not null)
      foreach (var kv in overrides)
        settings[kv.Key] = kv.Value;

    return new ConfigurationBuilder()
        .AddInMemoryCollection(settings)
        .Build();
  }
}
