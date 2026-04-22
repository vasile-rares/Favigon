namespace Favigon.Converter.Utils;

/// <summary>String constants for the supported output framework names.</summary>
public static class FrameworkNames
{
  public const string Html = "html";
  public const string React = "react";
  public const string Angular = "angular";

  public static readonly IReadOnlySet<string> All =
    new HashSet<string>(StringComparer.OrdinalIgnoreCase) { Html, React, Angular };

  public static bool IsValid(string framework) => All.Contains(framework);
}
