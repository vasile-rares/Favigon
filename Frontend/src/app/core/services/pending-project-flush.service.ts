import { Injectable, inject } from '@angular/core';
import { dataUrlToBlob } from '../utils/data-url.util';
import { ProjectService } from './project.service';

const STORAGE_KEY_PREFIX = 'favigon.pending-project-flush.';

interface PendingProjectFlushPayload {
  version: 1;
  projectId: number;
  designJson: string;
  thumbnailDataUrl: string | null;
  createdAt: number;
}

@Injectable({ providedIn: 'root' })
export class PendingProjectFlushService {
  private readonly projectService = inject(ProjectService);

  constructor() {
    queueMicrotask(() => {
      this.replayPendingFlushes();
    });
  }

  queueAndDispatch(projectId: number, designJson: string, thumbnailDataUrl: string | null): void {
    const payload: PendingProjectFlushPayload = {
      version: 1,
      projectId,
      designJson,
      thumbnailDataUrl,
      createdAt: Date.now(),
    };

    this.writePendingPayload(payload);
    this.projectService.dispatchExitFlush(projectId, designJson, dataUrlToBlob(thumbnailDataUrl));
  }

  clearPendingFlush(projectId: number): void {
    if (!this.canUseLocalStorage()) {
      return;
    }

    try {
      window.localStorage.removeItem(this.getStorageKey(projectId));
    } catch {
      // Ignore storage failures.
    }
  }

  private replayPendingFlushes(): void {
    const payloads = this.readPendingPayloads();
    if (payloads.length === 0) {
      return;
    }

    for (const payload of payloads.sort((left, right) => left.createdAt - right.createdAt)) {
      this.projectService
        .flushProjectOnExit(
          payload.projectId,
          payload.designJson,
          dataUrlToBlob(payload.thumbnailDataUrl),
        )
        .subscribe({
          next: () => {
            this.clearPendingFlush(payload.projectId);
          },
          error: (error: { status?: number }) => {
            if (error.status === 404) {
              this.clearPendingFlush(payload.projectId);
            }
          },
        });
    }
  }

  private readPendingPayloads(): PendingProjectFlushPayload[] {
    if (!this.canUseLocalStorage()) {
      return [];
    }

    const payloads: PendingProjectFlushPayload[] = [];

    try {
      for (let index = 0; index < window.localStorage.length; index += 1) {
        const key = window.localStorage.key(index);
        if (!key?.startsWith(STORAGE_KEY_PREFIX)) {
          continue;
        }

        const rawValue = window.localStorage.getItem(key);
        if (!rawValue) {
          continue;
        }

        try {
          const parsed = JSON.parse(rawValue) as PendingProjectFlushPayload;
          if (
            parsed?.version === 1 &&
            Number.isInteger(parsed.projectId) &&
            typeof parsed.designJson === 'string'
          ) {
            payloads.push(parsed);
          }
        } catch {
          window.localStorage.removeItem(key);
        }
      }
    } catch {
      return [];
    }

    return payloads;
  }

  private writePendingPayload(payload: PendingProjectFlushPayload): void {
    if (!this.canUseLocalStorage()) {
      return;
    }

    try {
      window.localStorage.setItem(this.getStorageKey(payload.projectId), JSON.stringify(payload));
    } catch {
      // Ignore storage failures.
    }
  }

  private canUseLocalStorage(): boolean {
    return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
  }

  private getStorageKey(projectId: number): string {
    return `${STORAGE_KEY_PREFIX}${projectId}`;
  }
}
