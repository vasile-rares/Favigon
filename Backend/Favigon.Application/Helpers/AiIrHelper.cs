using System.Text.Json;
using System.Text.Json.Serialization;
using System.Text.RegularExpressions;
using Favigon.Converter.Models;
using Favigon.Converter.Validation;
using Microsoft.Extensions.Logging;

namespace Favigon.Application.Helpers;

/// <summary>
/// Shared utilities for parsing, validating, and normalising AI-generated IRNode JSON.
/// Used by all pipeline phase services to avoid duplicating logic.
/// </summary>
internal static partial class AiIrHelper
{
  internal static readonly JsonSerializerOptions JsonOptions = new()
  {
    PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
    DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
    Converters =
    {
      new JsonStringEnumConverter(JsonNamingPolicy.CamelCase),
      new SafeIRNodeListConverter()
    }
  };

  [GeneratedRegex(@"```(?:json)?\s*\n?([\s\S]*?)\n?\s*```")]
  private static partial Regex CodeFenceRegex();

  internal static string ExtractJson(string raw)
  {
    var trimmed = raw.Trim();

    var fenceMatch = CodeFenceRegex().Match(trimmed);
    if (fenceMatch.Success)
      trimmed = fenceMatch.Groups[1].Value.Trim();

    var firstBrace = trimmed.IndexOf('{');
    var lastBrace = trimmed.LastIndexOf('}');
    if (firstBrace >= 0 && lastBrace > firstBrace)
      trimmed = trimmed[firstBrace..(lastBrace + 1)];

    return trimmed;
  }

  internal static (IRNode? ir, string? error) TryParseIr(string raw, string context, ILogger logger)
  {
    logger.LogDebug("AI [{Context}] raw response ({Length} chars): {Raw}",
        context, raw.Length, raw[..Math.Min(raw.Length, 2000)]);

    var json = ExtractJson(raw);

    IRNode? ir;
    try
    {
      ir = JsonSerializer.Deserialize<IRNode>(json, JsonOptions);
    }
    catch (JsonException ex)
    {
      logger.LogError(ex, "AI [{Context}] returned unparseable JSON (first 1000 chars): {Raw}",
          context, json[..Math.Min(json.Length, 1000)]);
      return (null, "AI returned an invalid design structure.");
    }

    if (ir is null)
      return (null, "AI returned an empty design.");

    AssignSequentialIds(ir);
    DesignTokenNormalizer.Normalize(ir);

    var errors = IrValidator.GetValidationErrors(ir);
    if (errors.Count > 0)
    {
      logger.LogWarning("AI [{Context}] IR failed validation ({Count} errors): {Errors}",
          context, errors.Count, string.Join("; ", errors));
      return (null, string.Join("\n", errors.Take(10)));
    }

    return (ir, null);
  }

  internal static void AssignSequentialIds(IRNode root)
  {
    var counter = 1;
    AssignIds(root, ref counter);

    static void AssignIds(IRNode node, ref int counter)
    {
      node.Id = counter++.ToString();
      foreach (var child in node.Children)
        AssignIds(child, ref counter);
    }
  }

  /// <summary>
  /// Gracefully handles null / non-object items the AI sometimes generates inside children arrays
  /// instead of throwing JsonException and losing the entire design.
  /// </summary>
  internal sealed class SafeIRNodeListConverter : JsonConverter<List<IRNode>>
  {
    public override List<IRNode> Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
    {
      var result = new List<IRNode>();

      if (reader.TokenType == JsonTokenType.Null)
        return result;

      if (reader.TokenType != JsonTokenType.StartArray)
      {
        reader.Skip();
        return result;
      }

      while (reader.Read() && reader.TokenType != JsonTokenType.EndArray)
      {
        if (reader.TokenType == JsonTokenType.Null)
          continue;

        if (reader.TokenType == JsonTokenType.StartObject)
        {
          var node = JsonSerializer.Deserialize<IRNode>(ref reader, options);
          if (node is not null)
            result.Add(node);
        }
        else
        {
          reader.Skip();
        }
      }

      return result;
    }

    public override void Write(Utf8JsonWriter writer, List<IRNode> value, JsonSerializerOptions options)
    {
      writer.WriteStartArray();
      foreach (var node in value)
        JsonSerializer.Serialize(writer, node, options);
      writer.WriteEndArray();
    }
  }
}
