using System.Net.Http.Json;
using System.Runtime.CompilerServices;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using Favigon.Application.Interfaces;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

namespace Favigon.Infrastructure.External.AI;

public class GeminiClient : IAiClient
{
  private readonly HttpClient _httpClient;
  private readonly string _model;
  private readonly string _apiKey;
  private readonly ILogger<GeminiClient> _logger;

  private static readonly JsonSerializerOptions JsonOptions = new()
  {
    PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
    DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull
  };

  public GeminiClient(HttpClient httpClient, IConfiguration configuration, ILogger<GeminiClient> logger)
  {
    _httpClient = httpClient;
    _logger = logger;

    _apiKey = configuration["Gemini:ApiKey"]
        ?? throw new InvalidOperationException("Gemini:ApiKey is not configured.");

    _model = configuration["Gemini:Model"] ?? "gemini-2.0-flash";
    _httpClient.BaseAddress = new Uri("https://generativelanguage.googleapis.com/");
  }

  private static readonly int[] RetryableStatusCodes = [429, 503];
  private const int MaxRetries = 3;

  public async Task<string> ChatCompletionAsync(
      string systemPrompt,
      string userMessage,
      string? modelOverride = null,
      CancellationToken ct = default)
  {
    var model = ResolveModel(modelOverride);
    var url = $"v1beta/models/{model}:generateContent?key={_apiKey}";
    var payload = BuildRequest(systemPrompt, userMessage);

    for (var attempt = 0; attempt <= MaxRetries; attempt++)
    {
      var response = await _httpClient.PostAsJsonAsync(url, payload, JsonOptions, ct);

      if (response.IsSuccessStatusCode)
      {
        var result = await response.Content.ReadFromJsonAsync<GeminiResponse>(ct);
        var text = result?.Candidates?.FirstOrDefault()?.Content?.Parts?.FirstOrDefault()?.Text;
        if (string.IsNullOrWhiteSpace(text))
          throw new InvalidOperationException("Gemini returned an empty response.");
        return text;
      }

      var body = await response.Content.ReadAsStringAsync(ct);
      var status = (int)response.StatusCode;

      if (attempt < MaxRetries && RetryableStatusCodes.Contains(status))
      {
        var delay = TimeSpan.FromSeconds(Math.Pow(2, attempt + 1)); // 2s, 4s, 8s
        _logger.LogWarning("Gemini API {Status} (attempt {Attempt}/{Max}), retrying in {Delay}s...",
            status, attempt + 1, MaxRetries, delay.TotalSeconds);
        await Task.Delay(delay, ct);
        continue;
      }

      _logger.LogError("Gemini API error {Status}: {Body}", status, body);
      throw new InvalidOperationException($"Gemini API returned {status}.");
    }

    throw new InvalidOperationException("Gemini API failed after all retries.");
  }

  public async IAsyncEnumerable<string> StreamChatCompletionAsync(
      string systemPrompt,
      string userMessage,
      string? modelOverride = null,
      [EnumeratorCancellation] CancellationToken ct = default)
  {
    var model = ResolveModel(modelOverride);
    var url = $"v1beta/models/{model}:streamGenerateContent?alt=sse&key={_apiKey}";
    var payload = BuildRequest(systemPrompt, userMessage);

    var json = JsonSerializer.Serialize(payload, JsonOptions);

    HttpResponseMessage? response = null;
    for (var attempt = 0; attempt <= MaxRetries; attempt++)
    {
      using var requestMessage = new HttpRequestMessage(HttpMethod.Post, url)
      {
        Content = new StringContent(json, Encoding.UTF8, "application/json")
      };

      response = await _httpClient.SendAsync(requestMessage, HttpCompletionOption.ResponseHeadersRead, ct);

      if (response.IsSuccessStatusCode) break;

      var body = await response.Content.ReadAsStringAsync(ct);
      var status = (int)response.StatusCode;

      if (attempt < MaxRetries && RetryableStatusCodes.Contains(status))
      {
        var delay = TimeSpan.FromSeconds(Math.Pow(2, attempt + 1));
        _logger.LogWarning("Gemini streaming API {Status} (attempt {Attempt}/{Max}), retrying in {Delay}s...",
            status, attempt + 1, MaxRetries, delay.TotalSeconds);
        response.Dispose();
        response = null;
        await Task.Delay(delay, ct);
        continue;
      }

      _logger.LogError("Gemini streaming API error {Status}: {Body}", status, body);
      throw new InvalidOperationException($"Gemini API returned {status}.");
    }

    if (response is null || !response.IsSuccessStatusCode)
      throw new InvalidOperationException("Gemini streaming API failed after all retries.");

    using var stream = await response.Content.ReadAsStreamAsync(ct);
    using var reader = new StreamReader(stream);

    while (!reader.EndOfStream)
    {
      ct.ThrowIfCancellationRequested();
      var line = await reader.ReadLineAsync(ct);

      if (string.IsNullOrEmpty(line) || !line.StartsWith("data: "))
        continue;

      var data = line["data: ".Length..];

      GeminiResponse? chunk;
      try
      {
        chunk = JsonSerializer.Deserialize<GeminiResponse>(data, JsonOptions);
      }
      catch (JsonException)
      {
        continue;
      }

      var delta = chunk?.Candidates?.FirstOrDefault()?.Content?.Parts?.FirstOrDefault()?.Text;
      if (!string.IsNullOrEmpty(delta))
        yield return delta;
    }
  }

  private string ResolveModel(string? modelOverride) =>
      string.IsNullOrWhiteSpace(modelOverride) ? _model : modelOverride;

  private static GeminiRequest BuildRequest(string systemPrompt, string userMessage) =>
      new()
      {
        SystemInstruction = new GeminiContent
        {
          Parts = [new GeminiPart { Text = systemPrompt }]
        },
        Contents =
        [
          new GeminiContent
          {
            Role = "user",
            Parts = [new GeminiPart { Text = userMessage }]
          }
        ],
        GenerationConfig = new GeminiGenerationConfig
        {
          Temperature = 0.7,
          ResponseMimeType = "application/json"
        }
      };

  // --- internal DTOs ---

  private class GeminiRequest
  {
    [JsonPropertyName("systemInstruction")]
    public GeminiContent? SystemInstruction { get; set; }

    [JsonPropertyName("contents")]
    public List<GeminiContent> Contents { get; set; } = [];

    [JsonPropertyName("generationConfig")]
    public GeminiGenerationConfig? GenerationConfig { get; set; }
  }

  private class GeminiContent
  {
    [JsonPropertyName("role")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? Role { get; set; }

    [JsonPropertyName("parts")]
    public List<GeminiPart> Parts { get; set; } = [];
  }

  private class GeminiPart
  {
    [JsonPropertyName("text")]
    public string Text { get; set; } = "";
  }

  private class GeminiGenerationConfig
  {
    [JsonPropertyName("temperature")]
    public double Temperature { get; set; }

    [JsonPropertyName("responseMimeType")]
    public string ResponseMimeType { get; set; } = "application/json";
  }

  private class GeminiResponse
  {
    [JsonPropertyName("candidates")]
    public List<GeminiCandidate>? Candidates { get; set; }
  }

  private class GeminiCandidate
  {
    [JsonPropertyName("content")]
    public GeminiContent? Content { get; set; }
  }
}
