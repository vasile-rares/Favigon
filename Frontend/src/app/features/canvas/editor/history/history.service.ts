/**
 * HistoryService — v2 undo/redo with version-counter equality checks.
 *
 * CHANGES FROM OLD CanvasHistoryService:
 * - Stack depth increased from 10 to 50.
 * - Equality check uses a version counter instead of JSON.stringify.
 *   Every SceneGraph mutation bumps `graph.version`. We store the version
 *   at snapshot time and compare numbers — O(1) instead of O(n).
 * - Snapshots store serialized SceneNodeDTO[] (the portable format) plus
 *   editor metadata (selectedNodeId, currentPageId). This decouples history
 *   from the runtime SceneGraph reference.
 * - The gesture-history and text-edit-history patterns from the old service
 *   are preserved: begin → (interact) → commit separates the before/after.
 * - `isApplyingHistory` flag prevents re-entrant pushes during undo/redo.
 */

import { Injectable, signal, computed } from '@angular/core';
import { SceneNodeDTO, PageModel } from '../../engine/types';

// ── Config ──────────────────────────────────────────────────

const MAX_HISTORY_STEPS = 50;

// ── Types ───────────────────────────────────────────────────

export interface HistorySnapshot {
  /** Serialized scene nodes for every page. */
  pages: PageModel[];
  /** Which page was active at snapshot time. */
  currentPageId: string | null;
  /** Which node was selected at snapshot time. */
  selectedNodeId: string | null;
  /** Graph version at snapshot time (used for cheap equality). */
  version: number;
}

export type SnapshotFactory = () => HistorySnapshot;
export type SnapshotApplier = (snapshot: HistorySnapshot) => void;

// ── Service ─────────────────────────────────────────────────

@Injectable()
export class HistoryService {
  private undoStack: HistorySnapshot[] = [];
  private redoStack: HistorySnapshot[] = [];
  private pendingGestureSnapshot: HistorySnapshot | null = null;
  private pendingTextEditSnapshot: HistorySnapshot | null = null;
  private _isApplying = false;

  // Expose to template / other services (read-only).
  readonly canUndo = signal(false);
  readonly canRedo = signal(false);

  get isApplyingHistory(): boolean {
    return this._isApplying;
  }

  // ── Atomic History ────────────────────────────────────────

  /**
   * Run a single action wrapped in history.
   * Captures a "before" snapshot, executes the action, then captures "after".
   * If versions differ, pushes onto the undo stack.
   */
  runWithHistory(createSnapshot: SnapshotFactory, action: () => void): void {
    if (this._isApplying) {
      action();
      return;
    }

    const before = createSnapshot();
    action();
    this.pushIfChanged(before, createSnapshot());
  }

  // ── Gesture History (drag / resize / rotate) ─────────────

  beginGestureHistory(createSnapshot: SnapshotFactory): void {
    if (this._isApplying || this.pendingGestureSnapshot) return;
    this.pendingGestureSnapshot = createSnapshot();
  }

  commitGestureHistory(createSnapshot?: SnapshotFactory): void {
    if (!this.pendingGestureSnapshot) return;
    const before = this.pendingGestureSnapshot;
    this.pendingGestureSnapshot = null;
    if (createSnapshot) {
      this.pushIfChanged(before, createSnapshot());
    }
  }

  // ── Text-Edit History ────────────────────────────────────

  beginTextEditHistory(createSnapshot: SnapshotFactory): void {
    if (this._isApplying || this.pendingTextEditSnapshot) return;
    this.pendingTextEditSnapshot = createSnapshot();
  }

  commitTextEditHistory(createSnapshot?: SnapshotFactory): void {
    if (!this.pendingTextEditSnapshot) return;
    const before = this.pendingTextEditSnapshot;
    this.pendingTextEditSnapshot = null;
    if (createSnapshot) {
      this.pushIfChanged(before, createSnapshot());
    }
  }

  // ── Undo / Redo ──────────────────────────────────────────

  undo(createSnapshot: SnapshotFactory, applySnapshot: SnapshotApplier): void {
    this.commitGestureHistory(createSnapshot);
    this.commitTextEditHistory(createSnapshot);

    const snapshot = this.undoStack.pop();
    if (!snapshot) return;

    this.redoStack.push(createSnapshot());
    this.apply(snapshot, applySnapshot);
    this.updateSignals();
  }

  redo(createSnapshot: SnapshotFactory, applySnapshot: SnapshotApplier): void {
    this.commitGestureHistory(createSnapshot);
    this.commitTextEditHistory(createSnapshot);

    const snapshot = this.redoStack.pop();
    if (!snapshot) return;

    this.undoStack.push(createSnapshot());
    this.apply(snapshot, applySnapshot);
    this.updateSignals();
  }

  /** Clear all history (used on project load or page switch). */
  reset(): void {
    this.undoStack = [];
    this.redoStack = [];
    this.pendingGestureSnapshot = null;
    this.pendingTextEditSnapshot = null;
    this.updateSignals();
  }

  // ── Private Helpers ───────────────────────────────────────

  private apply(snapshot: HistorySnapshot, applier: SnapshotApplier): void {
    this._isApplying = true;
    applier(snapshot);
    this._isApplying = false;
  }

  private pushIfChanged(before: HistorySnapshot, after: HistorySnapshot): void {
    if (this._isApplying) return;
    // O(1) equality check using version counter.
    if (before.version === after.version) return;

    this.undoStack.push(before);
    this.trimUndoStack();
    this.redoStack = [];
    this.updateSignals();
  }

  private trimUndoStack(): void {
    if (this.undoStack.length > MAX_HISTORY_STEPS) {
      this.undoStack = this.undoStack.slice(-MAX_HISTORY_STEPS);
    }
  }

  private updateSignals(): void {
    this.canUndo.set(this.undoStack.length > 0);
    this.canRedo.set(this.redoStack.length > 0);
  }
}
