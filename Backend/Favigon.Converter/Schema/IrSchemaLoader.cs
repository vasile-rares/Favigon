using System.Reflection;

namespace Favigon.Converter.Schema;

/// <summary>
/// Loads the AI-facing IR JSON Schema from either filesystem (dev, hot reload) or embedded resource (prod).
/// </summary>
public static class IrSchemaLoader
{
  private const string ResourceName = "Favigon.Converter.Schema.IrAiSchema.json";

  // Cached for production — embedded resource never changes at runtime.
  private static string? _cachedEmbeddedSchema;

  /// <summary>
  /// Returns the IR AI Schema JSON string.
  /// </summary>
  /// <param name="overridePath">
  /// Optional file path (absolute or relative to the current working directory).
  /// When set and the file exists, the schema is read from disk on every call,
  /// enabling hot reload without restarting the application in development.
  /// Falls back to the embedded resource if the path is null or the file is not found.
  /// </param>
  public static string GetAiSchema(string? overridePath = null)
  {
    if (!string.IsNullOrWhiteSpace(overridePath))
    {
      var resolved = Path.IsPathRooted(overridePath)
          ? overridePath
          : Path.GetFullPath(overridePath, Directory.GetCurrentDirectory());

      if (File.Exists(resolved))
        return File.ReadAllText(resolved);
    }

    // Embedded resource (cached — loaded once per process lifetime).
    if (_cachedEmbeddedSchema is not null)
      return _cachedEmbeddedSchema;

    var assembly = Assembly.GetExecutingAssembly();
    using var stream = assembly.GetManifestResourceStream(ResourceName)
        ?? throw new InvalidOperationException(
            $"Embedded resource '{ResourceName}' not found in '{assembly.FullName}'. " +
            "Ensure IrAiSchema.json is marked as EmbeddedResource in Favigon.Converter.csproj.");

    using var reader = new StreamReader(stream);
    _cachedEmbeddedSchema = reader.ReadToEnd();
    return _cachedEmbeddedSchema;
  }
}
