using AutoMapper;
using Prismatic.Application.DTOs.Requests;
using Prismatic.Application.DTOs.Responses;
using Prismatic.Application.Interfaces;
using Prismatic.Domain.Entities;

namespace Prismatic.Application.Services;

public class ProjectService : IProjectService
{
  private readonly IProjectRepository _projectRepository;
  private readonly IMapper _mapper;

  public ProjectService(
    IProjectRepository projectRepository,
    IMapper mapper)
  {
    _projectRepository = projectRepository;
    _mapper = mapper;
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

    var project = _mapper.Map<Project>(request);
    project.UserId = userId;

    var created = await _projectRepository.AddAsync(project);
    return _mapper.Map<ProjectResponse>(created);
  }

  public async Task<ProjectResponse?> UpdateAsync(int id, ProjectUpdateRequest request, int userId)
  {
    var existing = await _projectRepository.GetByIdAsync(id, userId);
    if (existing == null) return null;

    request.Name = request.Name.Trim();
    _mapper.Map(request, existing);

    await _projectRepository.UpdateAsync(existing);
    return _mapper.Map<ProjectResponse>(existing);
  }

  public async Task<bool> DeleteAsync(int id, int userId)
  {
    var existing = await _projectRepository.GetByIdAsync(id, userId);
    if (existing == null) return false;

    await _projectRepository.DeleteAsync(existing);
    return true;
  }

  public async Task<ProjectDesignResponse?> GetDesignByProjectIdAsync(int projectId, int userId)
  {
    var project = await _projectRepository.GetByIdAsync(projectId, userId);
    if (project == null) return null;

    return new ProjectDesignResponse
    {
      ProjectId = project.Id,
      DesignJson = string.IsNullOrWhiteSpace(project.DesignJson) ? "{}" : project.DesignJson,
      UpdatedAt = project.UpdatedAt
    };
  }

  public async Task<ProjectDesignResponse?> SaveDesignAsync(int projectId, int userId, ProjectDesignSaveRequest request)
  {
    var project = await _projectRepository.GetByIdAsync(projectId, userId);
    if (project == null) return null;

    project.DesignJson = string.IsNullOrWhiteSpace(request.DesignJson) ? "{}" : request.DesignJson;
    await _projectRepository.UpdateAsync(project);

    return new ProjectDesignResponse
    {
      ProjectId = project.Id,
      DesignJson = string.IsNullOrWhiteSpace(project.DesignJson) ? "{}" : project.DesignJson,
      UpdatedAt = project.UpdatedAt
    };
  }
}
