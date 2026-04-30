using Favigon.Application.DTOs.Requests;
using Favigon.Application.DTOs.Responses;

namespace Favigon.Application.Interfaces;

public interface IAiPipelineService
{
  Task<AiPipelineResponse> RunPipelineAsync(AiPipelineRequest request, CancellationToken ct = default);
  IAsyncEnumerable<AiStreamEvent> RunPipelineStreamingAsync(AiPipelineRequest request, CancellationToken ct = default);
}
