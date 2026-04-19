namespace Favigon.Application.Interfaces;

public interface IAiClient
{
  Task<string> ChatCompletionAsync(string systemPrompt, string userMessage, CancellationToken ct = default);
  IAsyncEnumerable<string> StreamChatCompletionAsync(string systemPrompt, string userMessage, CancellationToken ct = default);
}
