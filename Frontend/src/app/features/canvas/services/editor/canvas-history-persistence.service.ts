import { Injectable } from '@angular/core';
import { HistorySnapshot } from '../../canvas.types';

const DB_NAME = 'favigon-canvas-history';
const DB_VERSION = 1;
const STORE_NAME = 'undo-stacks';
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const DEBOUNCE_MS = 400;
const MAX_PAYLOAD_CHARS = 10 * 1024 * 1024; // ~10 MB as char count

interface HistoryRecord {
  projectId: number;
  stack: HistorySnapshot[];
  savedAt: number;
}

@Injectable({ providedIn: 'root' })
export class CanvasHistoryPersistenceService {
  private dbReady: Promise<IDBDatabase | null>;
  private debounceTimers = new Map<number, ReturnType<typeof setTimeout>>();

  constructor() {
    this.dbReady = this.openDb();
  }

  /** Debounced write — safe to call on every history push. */
  persist(projectId: number, stack: HistorySnapshot[]): void {
    const existing = this.debounceTimers.get(projectId);
    if (existing) clearTimeout(existing);

    const timer = setTimeout(() => {
      this.debounceTimers.delete(projectId);
      void this.writeStack(projectId, stack);
    }, DEBOUNCE_MS);

    this.debounceTimers.set(projectId, timer);
  }

  /** Restore the undo stack for a project (returns null if nothing stored or expired). */
  async restore(projectId: number): Promise<HistorySnapshot[] | null> {
    const db = await this.dbReady;
    if (!db) return null;

    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const req = tx.objectStore(STORE_NAME).get(projectId);
        req.onsuccess = () => {
          const record = req.result as HistoryRecord | undefined;
          if (!record) {
            resolve(null);
            return;
          }
          if (Date.now() - record.savedAt > MAX_AGE_MS) {
            resolve(null);
            return;
          }
          resolve(record.stack);
        };
        req.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  }

  /** Clear the stored history for a project (called when history is reset on fresh load). */
  clear(projectId: number): void {
    const existing = this.debounceTimers.get(projectId);
    if (existing) {
      clearTimeout(existing);
      this.debounceTimers.delete(projectId);
    }

    void this.dbReady.then((db) => {
      if (!db) return;
      try {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).delete(projectId);
      } catch {
        // Ignore — best-effort cleanup.
      }
    });
  }

  // ── Private ───────────────────────────────────────────────

  private async writeStack(projectId: number, stack: HistorySnapshot[]): Promise<void> {
    const db = await this.dbReady;
    if (!db || stack.length === 0) return;

    try {
      const record: HistoryRecord = { projectId, stack, savedAt: Date.now() };
      const json = JSON.stringify(record);
      if (json.length > MAX_PAYLOAD_CHARS) {
        return; // Skip silently if design is too large to persist safely.
      }

      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(record);
    } catch (err) {
      console.warn('[undo-persist] Failed to write to IndexedDB:', err);
    }
  }

  private openDb(): Promise<IDBDatabase | null> {
    return new Promise((resolve) => {
      if (typeof indexedDB === 'undefined') {
        resolve(null);
        return;
      }

      const req = indexedDB.open(DB_NAME, DB_VERSION);

      req.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'projectId' });
        }
      };

      req.onsuccess = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        this.pruneOldEntries(db);
        resolve(db);
      };

      req.onerror = () => {
        console.warn('[undo-persist] Could not open IndexedDB for history persistence.');
        resolve(null);
      };
    });
  }

  private pruneOldEntries(db: IDBDatabase): void {
    try {
      const cutoff = Date.now() - MAX_AGE_MS;
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const cursorReq = tx.objectStore(STORE_NAME).openCursor();
      cursorReq.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest<IDBCursorWithValue | null>).result;
        if (!cursor) return;
        const record = cursor.value as HistoryRecord;
        if (record.savedAt < cutoff) cursor.delete();
        cursor.continue();
      };
    } catch {
      // Ignore pruning errors — not critical.
    }
  }
}
