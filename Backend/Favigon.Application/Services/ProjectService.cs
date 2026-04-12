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
  private const int MaxThumbnailSizeBytes = 5 * 1024 * 1024;

  private static readonly JsonSerializerOptions IrDeserializationOptions = new()
  {
    PropertyNameCaseInsensitive = true
  };

  private static readonly HashSet<string> AllowedThumbnailContentTypes = new(StringComparer.OrdinalIgnoreCase)
  {
    "image/jpeg",
    "image/png",
    "image/webp"
  };

  private readonly IProjectRepository _projectRepository;
  private readonly IMapper _mapper;
  private readonly IConverterEngine _converterEngine;
  private readonly IProjectAssetStorage _projectAssetStorage;

  public ProjectService(
    IProjectRepository projectRepository,
    IMapper mapper,
    IConverterEngine converterEngine,
    IProjectAssetStorage projectAssetStorage)
  {
    _projectRepository = projectRepository;
    _mapper = mapper;
    _converterEngine = converterEngine;
    _projectAssetStorage = projectAssetStorage;
  }

  public async Task<IReadOnlyList<ProjectResponse>> GetAllAsync()
  {
    var projects = await _projectRepository.GetAllAsync();
    return projects.Select(MapProjectResponse).ToList();
  }

  public async Task<IReadOnlyList<ProjectResponse>> GetByUserIdAsync(int userId, bool? isPublic = null)
  {
    var projects = await _projectRepository.GetByUserIdAsync(userId, isPublic);
    return projects.Select(MapProjectResponse).ToList();
  }

  public async Task<ProjectResponse?> GetByIdAsync(int id, int userId)
  {
    var project = await _projectRepository.GetByIdAsync(id, userId);
    return project == null ? null : MapProjectResponse(project);
  }

  public async Task<ProjectResponse> CreateAsync(ProjectCreateRequest request, int userId)
  {
    request.Name = request.Name.Trim();

    var project = _mapper.Map<Project>(request);
    project.UserId = userId;

    var created = await _projectRepository.AddAsync(project);
    return MapProjectResponse(created);
  }

  public async Task<ProjectResponse?> UpdateAsync(int id, ProjectUpdateRequest request, int userId)
  {
    var existing = await _projectRepository.GetByIdAsync(id, userId);
    if (existing == null) return null;

    request.Name = request.Name.Trim();
    _mapper.Map(request, existing);

    await _projectRepository.UpdateAsync(existing);
    return MapProjectResponse(existing);
  }

  public async Task<bool> DeleteAsync(int id, int userId, CancellationToken cancellationToken = default)
  {
    var existing = await _projectRepository.GetByIdAsync(id, userId);
    if (existing == null) return false;

    await _projectAssetStorage.DeleteProjectAssetsAsync(existing.UserId, existing.Id, cancellationToken);
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

    var previousAssetPaths = CollectManagedProjectAssetPaths(project.DesignJson, project.UserId, project.Id);
    var normalizedDesignJson = NormalizeAndValidateDesignJson(request.DesignJson);
    var currentAssetPaths = CollectManagedProjectAssetPaths(normalizedDesignJson, project.UserId, project.Id);

    project.DesignJson = normalizedDesignJson;
    await _projectRepository.UpdateAsync(project);

    var orphanedAssetPaths = previousAssetPaths
      .Except(currentAssetPaths, StringComparer.OrdinalIgnoreCase)
      .ToArray();
    if (orphanedAssetPaths.Length > 0)
    {
      await _projectAssetStorage.DeleteAssetsAsync(project.UserId, project.Id, orphanedAssetPaths);
    }

    return new ProjectDesignResponse
    {
      ProjectId = project.Id,
      DesignJson = string.IsNullOrWhiteSpace(project.DesignJson) ? "{}" : project.DesignJson,
      UpdatedAt = project.UpdatedAt
    };
  }

  public async Task<bool> SaveThumbnailAsync(
    int projectId,
    int userId,
    ProjectImageUploadRequest request,
    CancellationToken cancellationToken = default)
  {
    var project = await _projectRepository.GetByIdAsync(projectId, userId);
    if (project == null) return false;

    ValidateThumbnailUploadRequest(request);

    await _projectAssetStorage.SaveThumbnailAsync(
      project.UserId,
      project.Id,
      request.Content,
      request.ContentType,
      cancellationToken);

    if (!string.IsNullOrWhiteSpace(project.ThumbnailDataUrl))
    {
      project.ThumbnailDataUrl = null;
      await _projectRepository.UpdateAsync(project);
    }

    return true;
  }

  private ProjectResponse MapProjectResponse(Project project)
  {
    var response = _mapper.Map<ProjectResponse>(project);
    response.ThumbnailDataUrl =
      _projectAssetStorage.GetThumbnailUrl(project.UserId, project.Id) ??
      project.ThumbnailDataUrl;
    return response;
  }

  private static void ValidateThumbnailUploadRequest(ProjectImageUploadRequest request)
  {
    if (request.Length <= 0)
    {
      throw new ArgumentException("Thumbnail file is empty.");
    }

    if (request.Length > MaxThumbnailSizeBytes)
    {
      throw new ArgumentException("Thumbnail file exceeds the 5 MB limit.");
    }

    if (string.IsNullOrWhiteSpace(request.FileName))
    {
      throw new ArgumentException("Thumbnail file name is required.");
    }

    if (request.Content == Stream.Null || !request.Content.CanRead)
    {
      throw new ArgumentException("Thumbnail file content is not readable.");
    }

    if (string.IsNullOrWhiteSpace(request.ContentType)
      || !AllowedThumbnailContentTypes.Contains(request.ContentType))
    {
      throw new ArgumentException("Only JPEG, PNG, and WebP thumbnails are supported.");
    }
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

  private static HashSet<string> CollectManagedProjectAssetPaths(
    string? designJson,
    int userId,
    int projectId)
  {
    var assetPaths = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
    if (string.IsNullOrWhiteSpace(designJson))
    {
      return assetPaths;
    }

    JsonNode? rootNode;
    try
    {
      rootNode = JsonNode.Parse(designJson);
    }
    catch (JsonException)
    {
      return assetPaths;
    }

    if (rootNode == null)
    {
      return assetPaths;
    }

    var assetPrefix = $"/project-assets/{userId}/{projectId}/";
    CollectManagedProjectAssetPaths(rootNode, assetPrefix, assetPaths);
    return assetPaths;
  }

  private static void CollectManagedProjectAssetPaths(
    JsonNode node,
    string assetPrefix,
    HashSet<string> assetPaths)
  {
    switch (node)
    {
      case JsonObject jsonObject:
        foreach (var property in jsonObject)
        {
          if (property.Value != null)
          {
            CollectManagedProjectAssetPaths(property.Value, assetPrefix, assetPaths);
          }
        }
        break;
      case JsonArray jsonArray:
        foreach (var item in jsonArray)
        {
          if (item != null)
          {
            CollectManagedProjectAssetPaths(item, assetPrefix, assetPaths);
          }
        }
        break;
      case JsonValue jsonValue when jsonValue.TryGetValue<string>(out var value):
        {
          var normalizedAssetPath = TryNormalizeManagedProjectAssetPath(value, assetPrefix);
          if (normalizedAssetPath != null)
          {
            assetPaths.Add(normalizedAssetPath);
          }
          break;
        }
    }
  }

  private static string? TryNormalizeManagedProjectAssetPath(string rawValue, string assetPrefix)
  {
    var candidate = UnwrapCssUrl(rawValue);
    if (string.IsNullOrWhiteSpace(candidate))
    {
      return null;
    }

    string path = candidate;
    if (Uri.TryCreate(candidate, UriKind.Absolute, out var absoluteUri))
    {
      path = absoluteUri.AbsolutePath;
    }

    var pathWithoutQuery = path.Split(['?', '#'], 2)[0];
    if (!pathWithoutQuery.StartsWith(assetPrefix, StringComparison.OrdinalIgnoreCase))
    {
      return null;
    }

    return pathWithoutQuery;
  }

  private static string UnwrapCssUrl(string value)
  {
    var trimmed = value.Trim();
    if (!trimmed.StartsWith("url(", StringComparison.OrdinalIgnoreCase) || !trimmed.EndsWith(')'))
    {
      return trimmed;
    }

    trimmed = trimmed[4..^1].Trim();
    if (
      (trimmed.StartsWith('\"') && trimmed.EndsWith('\"')) ||
      (trimmed.StartsWith('\'') && trimmed.EndsWith('\''))
    )
    {
      trimmed = trimmed[1..^1];
    }

    return trimmed;
  }

}
