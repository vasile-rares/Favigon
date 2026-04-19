import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AiDesignRequest, AiDesignResponse } from '../models/ai-design.models';

export interface AiStreamCallbacks {
  onChunk: (text: string) => void;
  onResult: (ir: AiDesignResponse) => void;
  onError: (message: string) => void;
  onDone: () => void;
}

@Injectable({ providedIn: 'root' })
export class AiDesignService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = environment.apiBaseUrl;

  generateDesign(request: AiDesignRequest): Observable<AiDesignResponse> {
    return this.http.post<AiDesignResponse>(`${this.baseUrl}/ai/design`, request);
  }

  async generateDesignStream(
    request: AiDesignRequest,
    callbacks: AiStreamCallbacks,
    signal?: AbortSignal,
  ): Promise<void> {
    const response = await fetch(`${this.baseUrl}/ai/design/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
      credentials: 'include',
      signal,
    });

    if (!response.ok || !response.body) {
      callbacks.onError('AI service is temporarily unavailable.');
      callbacks.onDone();
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        let eventType = '';
        for (const line of lines) {
          if (line.startsWith('event: ')) {
            eventType = line.slice(7).trim();
          } else if (line.startsWith('data: ')) {
            const data = line.slice(6).replace(/\\n/g, '\n');
            this.handleStreamEvent(eventType, data, callbacks);
            eventType = '';
          }
        }
      }
    } catch (e: unknown) {
      if (e instanceof DOMException && e.name === 'AbortError') return;
      callbacks.onError('Connection to AI service was lost.');
    } finally {
      callbacks.onDone();
    }
  }

  private handleStreamEvent(type: string, data: string, callbacks: AiStreamCallbacks): void {
    switch (type) {
      case 'chunk':
        callbacks.onChunk(data);
        break;
      case 'result':
        try {
          const ir = JSON.parse(data);
          callbacks.onResult({ success: true, ir });
        } catch {
          callbacks.onError('Failed to parse AI result.');
        }
        break;
      case 'error':
        callbacks.onError(data);
        break;
    }
  }
}
