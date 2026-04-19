using Favigon.Application.DTOs.Requests;
using Favigon.Application.DTOs.Responses;

namespace Favigon.Application.Interfaces;

public interface IAiDesignService
{
  Task<AiDesignResponse> GenerateDesignAsync(AiDesignRequest request, CancellationToken ct = default);
  IAsyncEnumerable<AiStreamEvent> GenerateDesignStreamingAsync(AiDesignRequest request, CancellationToken ct = default);
}

public record AiStreamEvent(string Type, string? Data);
