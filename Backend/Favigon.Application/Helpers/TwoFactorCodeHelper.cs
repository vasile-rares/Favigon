using System.Security.Cryptography;
using System.Text;

namespace Favigon.Application.Helpers;

public static class TwoFactorCodeHelper
{
  public static string GenerateCode()
  {
    return RandomNumberGenerator.GetInt32(0, 1_000_000).ToString("D6");
  }

  public static string HashCode(string code)
  {
    ArgumentException.ThrowIfNullOrWhiteSpace(code);

    var normalized = code.Trim();
    var bytes = SHA256.HashData(Encoding.UTF8.GetBytes(normalized));
    return Convert.ToHexString(bytes).ToLowerInvariant();
  }
}