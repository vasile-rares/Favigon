using AutoMapper;
using Favigon.Application.DTOs.Requests;
using Favigon.Application.DTOs.Responses;
using Favigon.Application.Interfaces;
using Favigon.Converter.Abstractions;
using Favigon.Converter.Models;
using Favigon.Converter.Validation;
using Favigon.Domain.Entities;
using System.Text.Json;
using System.Text.Json.Nodes;

namespace Favigon.Application.Services;

public class ProjectService : IProjectService
{
  private static readonly JsonSerializerOptions IrDeserializationOptions = new()
  {
    PropertyNameCaseInsensitive = true
  };

  private readonly IProjectRepository _projectRepository;
  private readonly IMapper _mapper;
  private readonly IConverterEngine _converterEngine;

  public ProjectService(
    IProjectRepository projectRepository,
    IMapper mapper,
    IConverterEngine converterEngine)
  {
    _projectRepository = projectRepository;
    _mapper = mapper;
    _converterEngine = converterEngine;
  }

  public async Task<IReadOnlyList<ProjectResponse>> GetAllAsync()
  {
    var projects = await _projectRepository.GetAllAsync();
    return _mapper.Map<List<ProjectResponse>>(projects);
  }

  public async Task<IReadOnlyList<ProjectResponse>> GetByUserIdAsync(int userId, bool? isPublic = null)
  {
    var projects = await _projectRepository.GetByUserIdAsync(userId, isPublic);
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

    project.DesignJson = NormalizeAndValidateDesignJson(request.DesignJson);
    await _projectRepository.UpdateAsync(project);

    return new ProjectDesignResponse
    {
      ProjectId = project.Id,
      DesignJson = string.IsNullOrWhiteSpace(project.DesignJson) ? "{}" : project.DesignJson,
      UpdatedAt = project.UpdatedAt
    };
  }

  public async Task<bool> SaveThumbnailAsync(int projectId, int userId, ProjectThumbnailSaveRequest request)
  {
    var project = await _projectRepository.GetByIdAsync(projectId, userId);
    if (project == null) return false;

    project.ThumbnailDataUrl = request.ThumbnailDataUrl;
    await _projectRepository.UpdateAsync(project);
    return true;
  }

  private string NormalizeAndValidateDesignJson(string? designJson)
  {
    if (string.IsNullOrWhiteSpace(designJson))
    {
      return "{}";
    }

    JsonNode? rootNode;
    try
    {
      rootNode = JsonNode.Parse(designJson);
    }
    catch (JsonException ex)
    {
      throw new ArgumentException("Design JSON is not valid JSON.", ex);
    }

    if (rootNode is null)
    {
      return "{}";
    }

    if (rootNode is not JsonObject rootObject)
    {
      throw new ArgumentException("Design JSON root must be a JSON object.");
    }

    if (rootObject.Count == 0)
    {
      return "{}";
    }

    NormalizeNumbers(rootObject);

    var normalizedDesignJson = rootObject.ToJsonString(new JsonSerializerOptions
    {
      WriteIndented = false
    });

    IRNode? irRoot;
    try
    {
      irRoot = JsonSerializer.Deserialize<IRNode>(normalizedDesignJson, IrDeserializationOptions);
    }
    catch (JsonException ex)
    {
      throw new ArgumentException("Design JSON does not match the expected IR shape.", ex);
    }

    if (irRoot == null)
    {
      throw new ArgumentException("Design JSON does not contain a valid IR root node.");
    }

    var validationErrors = IrValidator.GetValidationErrors(irRoot);
    if (validationErrors.Count > 0)
    {
      var details = string.Join(" ", validationErrors.Take(3));
      throw new ArgumentException($"Design JSON failed IR validation. {details}");
    }

    return normalizedDesignJson;
  }

  private static void NormalizeNumbers(JsonNode node)
  {
    switch (node)
    {
      case JsonObject jsonObject:
        {
          foreach (var propertyName in jsonObject.Select(property => property.Key).ToList())
          {
            var childNode = jsonObject[propertyName];
            if (childNode is null)
            {
              continue;
            }

            if (childNode is JsonValue jsonValue
              && TryNormalizeJsonValue(jsonValue, out var normalizedValue))
            {
              jsonObject[propertyName] = normalizedValue;
            }

            if (childNode is not JsonValue)
            {
              NormalizeNumbers(childNode);
            }
          }

          break;
        }
      case JsonArray jsonArray:
        {
          for (var index = 0; index < jsonArray.Count; index++)
          {
            var childNode = jsonArray[index];
            if (childNode is null)
            {
              continue;
            }

            if (childNode is JsonValue jsonValue
              && TryNormalizeJsonValue(jsonValue, out var normalizedValue))
            {
              jsonArray[index] = normalizedValue;
            }

            if (childNode is not JsonValue)
            {
              NormalizeNumbers(childNode);
            }
          }

          break;
        }
    }
  }

  private static bool TryNormalizeJsonValue(JsonValue value, out JsonNode normalizedValue)
  {
    normalizedValue = value;

    if (value.TryGetValue<JsonElement>(out var jsonElement)
      && jsonElement.ValueKind == JsonValueKind.Number
      && jsonElement.TryGetDecimal(out var number))
    {
      var rounded = Math.Round(number, 2, MidpointRounding.AwayFromZero);
      normalizedValue = JsonValue.Create(rounded)!;
      return true;
    }

    return false;
  }

}
