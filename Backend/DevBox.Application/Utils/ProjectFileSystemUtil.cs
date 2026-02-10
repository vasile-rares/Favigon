using System;
using System.IO;

namespace DevBox.Application.Utils;

public static class ProjectFileSystemUtil
{
  private static string BuildAbsolutePath(string projectsRoot, string relativePath)
  {
    return Path.GetFullPath(Path.Combine(projectsRoot, relativePath));
  }

  public static string BuildProjectRootAbsolutePath(string projectsRoot, string projectRelativePath)
  {
    return BuildAbsolutePath(projectsRoot, projectRelativePath);
  }

  public static bool TryResolveProjectFilePath(
    string projectsRoot,
    string projectRelativePath,
    string fileRelativePath,
    out string absolutePath)
  {
    absolutePath = string.Empty;
    if (string.IsNullOrWhiteSpace(fileRelativePath) || Path.IsPathRooted(fileRelativePath))
    {
      return false;
    }

    var projectRootAbsolute = BuildProjectRootAbsolutePath(projectsRoot, projectRelativePath);
    var normalizedRelative = fileRelativePath
      .Replace(Path.AltDirectorySeparatorChar, Path.DirectorySeparatorChar);
    var combined = Path.Combine(projectRootAbsolute, normalizedRelative);
    var resolved = Path.GetFullPath(combined);

    if (!resolved.StartsWith(projectRootAbsolute, StringComparison.OrdinalIgnoreCase))
    {
      return false;
    }

    absolutePath = resolved;
    return true;
  }

  public static void WriteFileContent(string absolutePath, string content)
  {
    var directory = Path.GetDirectoryName(absolutePath);
    if (!string.IsNullOrWhiteSpace(directory))
    {
      Directory.CreateDirectory(directory);
    }

    File.WriteAllText(absolutePath, content);
  }

  public static string BuildRelativePath(string username, string projectName)
  {
    var safeUser = SanitizeFolderName(username);
    var safeProject = SanitizeFolderName(projectName);

    return Path.Combine(safeUser, safeProject);
  }

  public static bool IsPathAvailable(string projectsRoot, string relativePath)
  {
    return !Directory.Exists(BuildAbsolutePath(projectsRoot, relativePath));
  }

  public static void CreateVanillaTemplate(
    string projectsRoot,
    string relativePath,
    string templatesRoot,
    string projectName)
  {
    var rootPath = BuildAbsolutePath(projectsRoot, relativePath);
    var directoryExisted = Directory.Exists(rootPath);
    Directory.CreateDirectory(rootPath);

    var htmlTemplatePath = Path.Combine(templatesRoot, "index.html");
    var cssTemplatePath = Path.Combine(templatesRoot, "style.css");
    var jsTemplatePath = Path.Combine(templatesRoot, "main.js");

    if (!File.Exists(htmlTemplatePath) || !File.Exists(cssTemplatePath) || !File.Exists(jsTemplatePath))
    {
      throw new InvalidOperationException($"Vanilla templates not found in {templatesRoot}");
    }

    var safeTitle = string.IsNullOrWhiteSpace(projectName) ? "DevBox Project" : projectName.Trim();
    var htmlTemplate = File.ReadAllText(htmlTemplatePath).Replace("{{TITLE}}", safeTitle);
    var cssTemplate = File.ReadAllText(cssTemplatePath);
    var jsTemplate = File.ReadAllText(jsTemplatePath);

    var createdPaths = new List<string>();
    try
    {
      WriteFileIfMissing(Path.Combine(rootPath, "index.html"), htmlTemplate, createdPaths);
      WriteFileIfMissing(Path.Combine(rootPath, "style.css"), cssTemplate, createdPaths);
      WriteFileIfMissing(Path.Combine(rootPath, "main.js"), jsTemplate, createdPaths);
    }
    catch
    {
      foreach (var path in createdPaths)
      {
        if (File.Exists(path))
        {
          File.Delete(path);
        }
      }

      if (!directoryExisted && Directory.Exists(rootPath) &&
          !Directory.EnumerateFileSystemEntries(rootPath).Any())
      {
        Directory.Delete(rootPath);
      }

      throw;
    }
  }

  public static void MoveProject(string projectsRoot, string oldRelativePath, string newRelativePath)
  {
    var oldAbsolutePath = BuildAbsolutePath(projectsRoot, oldRelativePath);
    var newAbsolutePath = BuildAbsolutePath(projectsRoot, newRelativePath);

    if (Directory.Exists(oldAbsolutePath))
    {
      if (Directory.Exists(newAbsolutePath))
      {
        throw new InvalidOperationException("Target project folder already exists.");
      }

      var newParent = Path.GetDirectoryName(newAbsolutePath);
      if (!string.IsNullOrWhiteSpace(newParent))
      {
        Directory.CreateDirectory(newParent);
      }

      Directory.Move(oldAbsolutePath, newAbsolutePath);
      return;
    }

    Directory.CreateDirectory(newAbsolutePath);
  }

  public static void TryDeleteDirectory(string projectsRoot, string relativePath)
  {
    var absolutePath = BuildAbsolutePath(projectsRoot, relativePath);
    try
    {
      if (Directory.Exists(absolutePath))
      {
        Directory.Delete(absolutePath, true);
      }
    }
    catch
    {
      // Best-effort cleanup to avoid failing the API after DB delete.
    }
  }

  private static string SanitizeFolderName(string value)
  {
    if (string.IsNullOrWhiteSpace(value))
    {
      return "untitled";
    }

    var invalidChars = Path.GetInvalidFileNameChars();
    var sanitized = new string(value.Trim()
      .Select(ch => invalidChars.Contains(ch) ? '_' : ch)
      .ToArray());

    return string.IsNullOrWhiteSpace(sanitized) ? "untitled" : sanitized;
  }

  private static void WriteFileIfMissing(string path, string content, List<string> createdPaths)
  {
    if (File.Exists(path))
    {
      return;
    }

    File.WriteAllText(path, content);
    createdPaths.Add(path);
  }
}
