import { inject, Injectable } from '@angular/core';
import { HistorySnapshot } from '../../canvas.types';
import { CanvasHistoryPersistenceService } from './canvas-history-persistence.service';

const MAX_HISTORY_STEPS = 50;

@Injectable()
export class CanvasHistoryService {
  private readonly persistence = inject(CanvasHistoryPersistenceService);

  private undoStack: HistorySnapshot[] = [];
  private redoStack: HistorySnapshot[] = [];
  private pendingGestureSnapshot: HistorySnapshot | null = null;
  private pendingTextEditSnapshot: HistorySnapshot | null = null;
  private isApplying = false;
  private projectId: number | null = null;

  get isApplyingHistory(): boolean {
    return this.isApplying;
  }

  /** Set the active project so pushes are persisted to IndexedDB. */
  setProjectId(id: number | null): void {
    this.projectId = id;
  }

  /** Restore a previously persisted undo stack (called after project load). */
  restoreStack(stack: HistorySnapshot[]): void {
    this.undoStack = stack;
    this.redoStack = [];
  }

  // ── Atomic History ────────────────────────────────────────

  runWithHistory(createSnapshot: () => HistorySnapshot, action: () => void): void {
    if (this.isApplying) {
      action();
      return;
    }

    const snapshot = createSnapshot();
    action();
    this.pushIfChanged(snapshot, createSnapshot());
  }

  // ── Gesture History (drag / resize / rotate) ─────────────

  beginGestureHistory(createSnapshot: () => HistorySnapshot): void {
    if (this.isApplying || this.pendingGestureSnapshot) {
      return;
    }

    this.pendingGestureSnapshot = createSnapshot();
  }

  commitGestureHistory(currentSnapshot?: () => HistorySnapshot): void {
    if (!this.pendingGestureSnapshot) {
      return;
    }

    const snapshot = this.pendingGestureSnapshot;
    this.pendingGestureSnapshot = null;

    if (currentSnapshot) {
      this.pushIfChanged(snapshot, currentSnapshot());
    }
  }

  // ── Text-Edit History ────────────────────────────────────

  beginTextEditHistory(createSnapshot: () => HistorySnapshot): void {
    if (this.isApplying || this.pendingTextEditSnapshot) {
      return;
    }

    this.pendingTextEditSnapshot = createSnapshot();
  }

  commitTextEditHistory(currentSnapshot?: () => HistorySnapshot): void {
    if (!this.pendingTextEditSnapshot) {
      return;
    }

    const snapshot = this.pendingTextEditSnapshot;
    this.pendingTextEditSnapshot = null;

    if (currentSnapshot) {
      this.pushIfChanged(snapshot, currentSnapshot());
    }
  }

  // ── Undo / Redo ──────────────────────────────────────────

  undo(
    createSnapshot: () => HistorySnapshot,
    applySnapshot: (snapshot: HistorySnapshot) => void,
  ): void {
    this.commitGestureHistory(createSnapshot);
    this.commitTextEditHistory(createSnapshot);

    const snapshot = this.undoStack.pop();
    if (!snapshot) {
      return;
    }

    this.redoStack.push(createSnapshot());
    this.applySnapshot(snapshot, applySnapshot);
  }

  redo(
    createSnapshot: () => HistorySnapshot,
    applySnapshot: (snapshot: HistorySnapshot) => void,
  ): void {
    this.commitGestureHistory(createSnapshot);
    this.commitTextEditHistory(createSnapshot);

    const snapshot = this.redoStack.pop();
    if (!snapshot) {
      return;
    }

    this.undoStack.push(createSnapshot());
    this.trimUndoStack();
    this.applySnapshot(snapshot, applySnapshot);
  }

  resetHistory(): void {
    this.undoStack = [];
    this.redoStack = [];
    this.pendingGestureSnapshot = null;
    this.pendingTextEditSnapshot = null;
    if (this.projectId !== null) {
      this.persistence.clear(this.projectId);
    }
  }

  // ── Private Helpers ───────────────────────────────────────

  private applySnapshot(
    snapshot: HistorySnapshot,
    apply: (snapshot: HistorySnapshot) => void,
  ): void {
    this.isApplying = true;
    apply(snapshot);
    this.isApplying = false;
  }

  private pushIfChanged(before: HistorySnapshot, after: HistorySnapshot): void {
    if (this.isApplying || this.areEqual(before, after)) {
      return;
    }

    this.undoStack.push(before);
    this.trimUndoStack();
    this.redoStack = [];

    if (this.projectId !== null) {
      this.persistence.persist(this.projectId, [...this.undoStack]);
    }
  }

  private trimUndoStack(): void {
    if (this.undoStack.length > MAX_HISTORY_STEPS) {
      this.undoStack = this.undoStack.slice(-MAX_HISTORY_STEPS);
    }
  }

  private areEqual(left: HistorySnapshot, right: HistorySnapshot): boolean {
    return JSON.stringify(left) === JSON.stringify(right);
  }
}
