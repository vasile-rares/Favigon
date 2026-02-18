using AutoMapper;
using Prismatic.Application.DTOs.Requests;
using Prismatic.Application.DTOs.Responses;
using Prismatic.Application.Interfaces;
using Prismatic.Application.Utils;
using Prismatic.Domain.Entities;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Hosting;
using System.IO;
using System.Linq;

namespace Prismatic.Application.Services;

public class ProjectService : IProjectService
{
  private readonly IProjectRepository _projectRepository;
  private readonly IUserRepository _userRepository;
  private readonly IMapper _mapper;
  private readonly string _projectsRootAbsolute;
  private readonly string _vanillaTemplatesRoot;

  public ProjectService(
    IProjectRepository projectRepository,
    IUserRepository userRepository,
    IMapper mapper,
    IConfiguration configuration,
    IHostEnvironment environment)
  {
    _projectRepository = projectRepository;
    _userRepository = userRepository;
    _mapper = mapper;
    var projectsRoot = configuration.GetValue<string>("Storage:ProjectsRoot") ?? string.Empty;
    _projectsRootAbsolute = string.IsNullOrWhiteSpace(projectsRoot)
      ? string.Empty
      : (Path.IsPathRooted(projectsRoot)
        ? projectsRoot
        : Path.GetFullPath(Path.Combine(environment.ContentRootPath, projectsRoot)));
    var templatesRoot = configuration.GetValue<string>("Storage:TemplatesRoot") ?? "Templates";
    var templatesRootAbsolute = Path.IsPathRooted(templatesRoot)
      ? templatesRoot
      : Path.GetFullPath(Path.Combine(environment.ContentRootPath, templatesRoot));
    _vanillaTemplatesRoot = Path.Combine(templatesRootAbsolute, "Vanilla");
  }

  public async Task<IReadOnlyList<ProjectResponse>> GetAllAsync()
  {
    var projects = await _projectRepository.GetAllAsync();
    return _mapper.Map<List<ProjectResponse>>(projects);
  }

  public async Task<IReadOnlyList<ProjectResponse>> GetByUserIdAsync(int userId)
  {
    var projects = await _projectRepository.GetByUserIdAsync(userId);
    return _mapper.Map<List<ProjectResponse>>(projects);
  }

  public async Task<ProjectResponse?> GetByIdAsync(int id, int userId)
  {
    var project = await _projectRepository.GetByIdAsync(id, userId);
    return project == null ? null : _mapper.Map<ProjectResponse>(project);
  }

  public async Task<ProjectResponse> CreateAsync(ProjectCreateRequest request, int userId)
  {
    request.Name = request.Name.Trim();
    request.Type = request.Type.Trim();
    EnsureProjectsRootConfigured();

    var user = await _userRepository.GetByIdAsync(userId);
    if (user == null)
    {
      throw new ArgumentException("User not found.");
    }

    var project = _mapper.Map<Project>(request);
    project.UserId = user.Id;
    project.RootPath = await BuildUniqueRelativePathAsync(user.Id, user.Username, request.Name);

    var created = await _projectRepository.AddAsync(project);
    try
    {
      if (string.Equals(request.Type, "Vanilla", StringComparison.OrdinalIgnoreCase))
      {
        ProjectFileSystemUtil.CreateVanillaTemplate(
          _projectsRootAbsolute,
          created.RootPath,
          _vanillaTemplatesRoot,
          created.Name);
      }

      return _mapper.Map<ProjectResponse>(created);
    }
    catch
    {
      await _projectRepository.DeleteAsync(created);
      throw;
    }
  }

  public async Task<ProjectResponse?> UpdateAsync(int id, ProjectUpdateRequest request, int userId)
  {
    var existing = await _projectRepository.GetByIdAsync(id, userId);
    if (existing == null)
    {
      return null;
    }

    request.Name = request.Name.Trim();
    request.Type = request.Type.Trim();

    var nameChanged = !string.Equals(existing.Name, request.Name, StringComparison.OrdinalIgnoreCase);
    if (nameChanged)
    {
      EnsureProjectsRootConfigured();

      var user = await _userRepository.GetByIdAsync(userId);
      if (user == null)
      {
        throw new ArgumentException("User not found.");
      }

      var newRelativePath = await BuildUniqueRelativePathAsync(
        existing.UserId,
        user.Username,
        request.Name,
        existing.Id);

      if (!string.Equals(existing.RootPath, newRelativePath, StringComparison.OrdinalIgnoreCase))
      {
        ProjectFileSystemUtil.MoveProject(_projectsRootAbsolute, existing.RootPath, newRelativePath);
        existing.RootPath = newRelativePath;
      }
    }

    _mapper.Map(request, existing);

    await _projectRepository.UpdateAsync(existing);
    return _mapper.Map<ProjectResponse>(existing);
  }

  public async Task<bool> DeleteAsync(int id, int userId)
  {
    var existing = await _projectRepository.GetByIdAsync(id, userId);
    if (existing == null)
    {
      return false;
    }

    EnsureProjectsRootConfigured();
    await _projectRepository.DeleteAsync(existing);
    ProjectFileSystemUtil.TryDeleteDirectory(_projectsRootAbsolute, existing.RootPath);

    return true;
  }

  public async Task<IReadOnlyList<ProjectFileEntryResponse>?> GetFilesAsync(int projectId, int userId)
  {
    EnsureProjectsRootConfigured();

    var project = await _projectRepository.GetByIdAsync(projectId, userId);
    if (project == null)
    {
      return null;
    }

    var projectRootAbsolute = ProjectFileSystemUtil.BuildProjectRootAbsolutePath(
      _projectsRootAbsolute,
      project.RootPath);

    if (!Directory.Exists(projectRootAbsolute))
    {
      return Array.Empty<ProjectFileEntryResponse>();
    }

    var excludedDirectories = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
    {
      "bin",
      "obj",
      ".git",
      ".vs",
      "node_modules"
    };

    bool IsExcluded(string relativePath)
    {
      var segments = relativePath
        .Split(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar)
        .Where(segment => !string.IsNullOrWhiteSpace(segment));

      return segments.Any(segment => excludedDirectories.Contains(segment));
    }

    var files = Directory.EnumerateFiles(projectRootAbsolute, "*", SearchOption.AllDirectories)
      .Select(path => new
      {
        AbsolutePath = path,
        RelativePath = Path.GetRelativePath(projectRootAbsolute, path)
      })
      .Where(item => !IsExcluded(item.RelativePath))
      .Select(item => new ProjectFileEntryResponse
      {
        Path = item.RelativePath.Replace(Path.DirectorySeparatorChar, '/'),
        Name = Path.GetFileName(item.RelativePath),
        Extension = Path.GetExtension(item.RelativePath),
        Size = new FileInfo(item.AbsolutePath).Length
      })
      .OrderBy(item => item.Path, StringComparer.OrdinalIgnoreCase)
      .ToList();

    return files;
  }

  public async Task<ProjectFileContentResponse?> GetFileContentAsync(
    int projectId,
    int userId,
    string relativePath)
  {
    EnsureProjectsRootConfigured();

    var project = await _projectRepository.GetByIdAsync(projectId, userId);
    if (project == null)
    {
      return null;
    }

    if (!ProjectFileSystemUtil.TryResolveProjectFilePath(
      _projectsRootAbsolute,
      project.RootPath,
      relativePath,
      out var absolutePath))
    {
      return null;
    }

    if (!File.Exists(absolutePath))
    {
      return null;
    }

    var content = await File.ReadAllTextAsync(absolutePath);
    return new ProjectFileContentResponse
    {
      Path = relativePath,
      Content = content
    };
  }

  public async Task<bool> UpdateFileContentAsync(
    int projectId,
    int userId,
    ProjectFileUpdateRequest request)
  {
    EnsureProjectsRootConfigured();

    var project = await _projectRepository.GetByIdAsync(projectId, userId);
    if (project == null)
    {
      return false;
    }

    if (!ProjectFileSystemUtil.TryResolveProjectFilePath(
      _projectsRootAbsolute,
      project.RootPath,
      request.Path,
      out var absolutePath))
    {
      return false;
    }

    ProjectFileSystemUtil.WriteFileContent(absolutePath, request.Content ?? string.Empty);
    return true;
  }

  private async Task<string> BuildUniqueRelativePathAsync(
    int userId,
    string username,
    string projectName,
    int? excludeProjectId = null)
  {
    var baseRelative = ProjectFileSystemUtil.BuildRelativePath(username, projectName);
    var baseDir = Path.GetDirectoryName(baseRelative) ?? string.Empty;
    var baseName = Path.GetFileName(baseRelative);

    var suffix = 0;
    while (true)
    {
      var candidate = suffix == 0
        ? baseRelative
        : Path.Combine(baseDir, $"{baseName}-{suffix}");

      var existsInDb = await _projectRepository.ExistsByUserAndRootPathAsync(userId, candidate, excludeProjectId);
      if (!existsInDb && ProjectFileSystemUtil.IsPathAvailable(_projectsRootAbsolute, candidate))
      {
        return candidate;
      }

      suffix++;
    }
  }

  private void EnsureProjectsRootConfigured()
  {
    if (string.IsNullOrWhiteSpace(_projectsRootAbsolute))
    {
      throw new InvalidOperationException("Storage:ProjectsRoot is not configured.");
    }
  }

}
