namespace Favigon.Application.Helpers;

public static class AuthUsernameHelper
{
  public static string BuildUsernameCandidate(string? rawCandidate, string email, string fallbackPrefix)
  {
    var raw = string.IsNullOrWhiteSpace(rawCandidate)
      ? email.Split('@')[0]
      : rawCandidate;

    var cleaned = new string(raw
      .Trim()
      .ToLowerInvariant()
      .Select(ch => char.IsLetterOrDigit(ch) || ch == '_' ? ch : '_')
      .ToArray());

    if (string.IsNullOrWhiteSpace(cleaned))
    {
      cleaned = fallbackPrefix;
    }

    return cleaned.Length <= 30 ? cleaned : cleaned[..30];
  }
}