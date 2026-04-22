using System.Net.Http.Json;
using System.Runtime.CompilerServices;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using Favigon.Application.Interfaces;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

namespace Favigon.Infrastructure.External.AI;

/// <summary>
/// AI client targeting the GitHub Models inference endpoint (OpenAI-compatible).
/// Authentication uses a GitHub Personal Access Token (PAT).
/// </summary>
public class GitHubModelsClient : IAiClient
{
  private readonly HttpClient _httpClient;
  private readonly string _defaultModel;
  private readonly ILogger<GitHubModelsClient> _logger;

  private static readonly JsonSerializerOptions JsonOptions = new()
  {
    DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull
  };

  // Models that support response_format: json_object (OpenAI GPT family only)
  private static readonly HashSet<string> JsonModeModels =
  [
    "gpt-4o",
    "gpt-4o-mini",
    "o4-mini",
    "o3-mini",
    "gpt-4-turbo",
  ];

  public GitHubModelsClient(HttpClient httpClient, IConfiguration configuration, ILogger<GitHubModelsClient> logger)
  {
    _httpClient = httpClient;
    _logger = logger;

    var apiKey = configuration["GitHubModels:ApiKey"]
        ?? throw new InvalidOperationException("GitHubModels:ApiKey is not configured. Set it to a GitHub Personal Access Token.");

    _defaultModel = configuration["GitHubModels:Model"] ?? "gpt-4o";

    _httpClient.BaseAddress = new Uri("https://models.inference.ai.azure.com/");
    _httpClient.DefaultRequestHeaders.Authorization =
        new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", apiKey);
  }

  public async Task<string> ChatCompletionAsync(
      string systemPrompt,
      string userMessage,
      string? modelOverride = null,
      CancellationToken ct = default)
  {
    var model = string.IsNullOrWhiteSpace(modelOverride) ? _defaultModel : modelOverride;

    var payload = BuildRequest(systemPrompt, userMessage, model, stream: false);
    var response = await _httpClient.PostAsJsonAsync("chat/completions", payload, JsonOptions, ct);

    if (!response.IsSuccessStatusCode)
    {
      var body = await response.Content.ReadAsStringAsync(ct);
      _logger.LogError("GitHub Models API error {Status} for model {Model}: {Body}", (int)response.StatusCode, model, body);
      throw new InvalidOperationException($"GitHub Models API returned {(int)response.StatusCode}.");
    }

    var result = await response.Content.ReadFromJsonAsync<ChatResponse>(ct);
    var content = result?.Choices?.FirstOrDefault()?.Message?.Content;

    if (string.IsNullOrWhiteSpace(content))
      throw new InvalidOperationException("GitHub Models returned an empty response.");

    return content;
  }

  public async IAsyncEnumerable<string> StreamChatCompletionAsync(
      string systemPrompt,
      string userMessage,
      string? modelOverride = null,
      [EnumeratorCancellation] CancellationToken ct = default)
  {
    var model = string.IsNullOrWhiteSpace(modelOverride) ? _defaultModel : modelOverride;

    var payload = BuildRequest(systemPrompt, userMessage, model, stream: true);
    var json = JsonSerializer.Serialize(payload, JsonOptions);

    using var requestMessage = new HttpRequestMessage(HttpMethod.Post, "chat/completions")
    {
      Content = new StringContent(json, Encoding.UTF8, "application/json")
    };

    using var response = await _httpClient.SendAsync(requestMessage, HttpCompletionOption.ResponseHeadersRead, ct);

    if (!response.IsSuccessStatusCode)
    {
      var body = await response.Content.ReadAsStringAsync(ct);
      _logger.LogError("GitHub Models streaming API error {Status} for model {Model}: {Body}", (int)response.StatusCode, model, body);
      throw new InvalidOperationException($"GitHub Models API returned {(int)response.StatusCode}.");
    }

    using var stream = await response.Content.ReadAsStreamAsync(ct);
    using var reader = new StreamReader(stream);

    while (!reader.EndOfStream)
    {
      ct.ThrowIfCancellationRequested();
      var line = await reader.ReadLineAsync(ct);

      if (string.IsNullOrEmpty(line) || !line.StartsWith("data: "))
        continue;

      var data = line["data: ".Length..];

      if (data == "[DONE]")
        yield break;

      StreamChunk? chunk;
      try
      {
        chunk = JsonSerializer.Deserialize<StreamChunk>(data);
      }
      catch (JsonException)
      {
        continue;
      }

      var delta = chunk?.Choices?.FirstOrDefault()?.Delta?.Content;
      if (!string.IsNullOrEmpty(delta))
        yield return delta;
    }
  }

  private ChatRequest BuildRequest(string systemPrompt, string userMessage, string model, bool stream)
  {
    var supportsJsonMode = JsonModeModels.Contains(model);

    return new ChatRequest
    {
      Model = model,
      ResponseFormat = supportsJsonMode ? new ResponseFormat { Type = "json_object" } : null,
      Stream = stream ? true : null,
      Temperature = 0.7,
      Messages =
      [
        new ChatMessage { Role = "system", Content = systemPrompt },
        new ChatMessage { Role = "user", Content = userMessage },
      ],
    };
  }

  // ── Internal DTOs ────────────────────────────────────────

  private class ChatRequest
  {
    [JsonPropertyName("model")]
    public string Model { get; set; } = "";

    [JsonPropertyName("messages")]
    public List<ChatMessage> Messages { get; set; } = [];

    [JsonPropertyName("response_format")]
    public ResponseFormat? ResponseFormat { get; set; }

    [JsonPropertyName("temperature")]
    public double Temperature { get; set; } = 0.7;

    [JsonPropertyName("stream")]
    public bool? Stream { get; set; }
  }

  private class ResponseFormat
  {
    [JsonPropertyName("type")]
    public string Type { get; set; } = "json_object";
  }

  private class ChatMessage
  {
    [JsonPropertyName("role")]
    public string Role { get; set; } = "";

    [JsonPropertyName("content")]
    public string Content { get; set; } = "";
  }

  private class ChatResponse
  {
    [JsonPropertyName("choices")]
    public List<Choice>? Choices { get; set; }
  }

  private class Choice
  {
    [JsonPropertyName("message")]
    public ChatMessage? Message { get; set; }

    [JsonPropertyName("delta")]
    public ChatMessage? Delta { get; set; }
  }

  private class StreamChunk
  {
    [JsonPropertyName("choices")]
    public List<Choice>? Choices { get; set; }
  }
}
