namespace Favigon.Converter.Utils;

public static class FrameworkNames
{
  public const string Html = "html";
  public const string React = "react";
  public const string Angular = "angular";

  public static readonly IReadOnlySet<string> All =
    new HashSet<string>(StringComparer.OrdinalIgnoreCase) { Html, React, Angular };

  public static bool IsValid(string framework) => All.Contains(framework);
}
