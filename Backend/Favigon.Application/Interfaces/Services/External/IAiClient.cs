namespace Favigon.Application.Interfaces;

public interface IAiClient
{
  Task<string> ChatCompletionAsync(string systemPrompt, string userMessage, string? modelOverride = null, CancellationToken ct = default);
  IAsyncEnumerable<string> StreamChatCompletionAsync(string systemPrompt, string userMessage, string? modelOverride = null, CancellationToken ct = default);
}
