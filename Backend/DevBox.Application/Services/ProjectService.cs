using AutoMapper;
using DevBox.Application.DTOs.Requests;
using DevBox.Application.DTOs.Responses;
using DevBox.Application.Interfaces;
using DevBox.Domain.Entities;

namespace DevBox.Application.Services;

public class ProjectService : IProjectService
{
  private readonly IProjectRepository _projectRepository;
  private readonly IMapper _mapper;

  public ProjectService(IProjectRepository projectRepository, IMapper mapper)
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

  public async Task<ProjectResponse?> GetByIdAsync(int id)
  {
    var project = await _projectRepository.GetByIdAsync(id);
    return project == null ? null : _mapper.Map<ProjectResponse>(project);
  }

  public async Task<ProjectResponse> CreateAsync(ProjectCreateRequest request)
  {
    request.Name = request.Name.Trim();
    request.Type = request.Type.Trim();
    request.RootPath = request.RootPath.Trim();

    var project = _mapper.Map<Project>(request);

    var created = await _projectRepository.AddAsync(project);
    return _mapper.Map<ProjectResponse>(created);
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
    request.RootPath = request.RootPath.Trim();

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

    await _projectRepository.DeleteAsync(existing);
    return true;
  }

}
