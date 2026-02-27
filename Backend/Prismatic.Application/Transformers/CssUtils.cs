using System.Text;

namespace Prismatic.Application.Transformers;

/// <summary>
/// Shared CSS string-building utilities used across transformers.
/// </summary>
internal static class CssUtils
{
    /// <summary>Converts a property dictionary to a semicolon-separated inline style string.</summary>
    internal static string BuildInlineStyle(Dictionary<string, string> props) =>
        string.Join("; ", props.Select(kv => $"{kv.Key}: {kv.Value}"));

    /// <summary>Converts a property dictionary to indented CSS rule body lines.</summary>
    internal static string BuildCssBlock(Dictionary<string, string> props)
    {
        var sb = new StringBuilder();
        foreach (var (k, v) in props)
            sb.Append($"  {k}: {v};\n");
        return sb.ToString();
    }
}
