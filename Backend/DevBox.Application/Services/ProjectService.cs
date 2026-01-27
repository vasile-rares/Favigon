using AutoMapper;
using DevBox.Application.DTOs.Requests;
using DevBox.Application.DTOs.Responses;
using DevBox.Application.Interfaces;
using DevBox.Application.Utils;
using DevBox.Domain.Entities;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Hosting;
using System.IO;

namespace DevBox.Application.Services;

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

  public async Task<ProjectResponse?> GetByIdAsync(int id)
  {
    var project = await _projectRepository.GetByIdAsync(id);
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

  public async Task<ProjectResponse?> UpdateAsync(int id, ProjectUpdateRequest request)
  {
    var existing = await _projectRepository.GetByIdAsync(id);
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

      var user = await _userRepository.GetByIdAsync(existing.UserId);
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

  public async Task<bool> DeleteAsync(int id)
  {
    var existing = await _projectRepository.GetByIdAsync(id);
    if (existing == null)
    {
      return false;
    }

    EnsureProjectsRootConfigured();
    await _projectRepository.DeleteAsync(existing);
    ProjectFileSystemUtil.TryDeleteDirectory(_projectsRootAbsolute, existing.RootPath);

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
