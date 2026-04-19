using System.Text.Json;
using Favigon.Converter.Models;

namespace Favigon.Converter.Utils;

/// <summary>Shared prop extraction helpers for IRNode.Props.</summary>
internal static class IrProps
{
  internal static string GetString(IRNode node, string key, string defaultValue = "")
  {
    if (!node.Props.TryGetValue(key, out var val)) return defaultValue;
    return val switch
    {
      null => defaultValue,
      JsonElement je => je.ValueKind == JsonValueKind.String
        ? je.GetString() ?? defaultValue
        : je.ToString(),
      _ => val.ToString() ?? defaultValue
    };
  }

  internal static bool GetBool(IRNode node, string key, bool defaultValue = false)
  {
    if (!node.Props.TryGetValue(key, out var val)) return defaultValue;
    return val switch
    {
      null => defaultValue,
      JsonElement je => je.ValueKind == JsonValueKind.True,
      bool b => b,
      _ => bool.TryParse(val?.ToString(), out var parsed) ? parsed : defaultValue
    };
  }

  internal static int GetInt(IRNode node, string key, int defaultValue = 0)
  {
    if (!node.Props.TryGetValue(key, out var val)) return defaultValue;
    return val switch
    {
      null => defaultValue,
      JsonElement je => je.TryGetInt32(out var i) ? i : defaultValue,
      int i => i,
      _ => int.TryParse(val?.ToString(), out var parsed) ? parsed : defaultValue
    };
  }

  internal static string ResolveTag(IRNode node, string defaultTag, params string[] allowedTags)
  {
    var requestedTag = GetString(node, "tag");
    if (string.IsNullOrWhiteSpace(requestedTag)) return defaultTag;

    foreach (var allowedTag in allowedTags)
    {
      if (string.Equals(allowedTag, requestedTag, StringComparison.OrdinalIgnoreCase))
        return allowedTag;
    }

    return defaultTag;
  }
}
