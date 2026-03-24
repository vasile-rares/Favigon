/**
 * EditorState — Angular service managing editor-level state (selection, tools,
 * live transform overlays). Uses Angular Signals for reactivity.
 *
 * CHANGE FROM OLD ARCHITECTURE:
 * - Old: all state lived as individual signals on the 2800-line
 *   canvas-page.component.ts. Gesture state, selection, tools, validation
 *   results — everything interleaved in one file.
 * - New: editor-level concerns are consolidated here, separate from the engine
 *   (SceneGraph, Camera, HitTester) and from Angular rendering.
 *
 * LIVE TRANSFORM:
 * - Old: every pointermove during drag created a new CanvasElement[], replaced
 *   the pages signal, invalidated all computed signals, and triggered full CD.
 * - New: during a drag/resize/rotate gesture, only `liveTransform` is updated
 *   (a lightweight overlay). The scene graph is NOT mutated until pointer-up.
 *   The template reads liveTransform to offset the rendering of the active
 *   element, avoiding full re-renders.
 */

import { Injectable, signal, computed } from '@angular/core';
import { Vec2, Vec2Zero } from '../../engine/math/vec2';
import { NodeType, PageModel, SceneNodeDTO } from '../../engine/types';

// ── Types ───────────────────────────────────────────────────

export type ToolType = NodeType | 'select';

export type GestureType = 'none' | 'drag' | 'resize' | 'rotate' | 'corner-radius' | 'page-drag';

export type HandlePosition = 'nw' | 'ne' | 'sw' | 'se' | 'n' | 's' | 'e' | 'w';

/**
 * Lightweight overlay applied during an active gesture.
 * The scene graph is NOT mutated during the gesture — only on commit.
 * The template reads this to visually offset the dragged element.
 */
export interface LiveTransform {
  nodeId: string;
  type: GestureType;
  /** Delta position (world-space) from the node's stored position. */
  deltaPosition: Vec2;
  /** Scale multiplier applied during resize (relative to start size). */
  deltaScale: Vec2;
  /** Delta rotation (radians) from the node's stored rotation. */
  deltaRotation: number;
  /** For resize: the handle being used. */
  handle?: HandlePosition;
}

export interface GestureStartState {
  nodeId: string;
  type: GestureType;
  /** World-space pointer position at gesture start. */
  startPointer: Vec2;
  /** Node's position at gesture start. */
  startPosition: Vec2;
  /** Node's size at gesture start. */
  startWidth: number;
  startHeight: number;
  /** Node's rotation at gesture start. */
  startRotation: number;
  /** Node's world-space center at gesture start (for rotation). */
  startCenter: Vec2;
  /** Drag offset: pointer - node position in world space. */
  dragOffset: Vec2;
  /** Aspect ratio at start (for constrained resize). */
  aspectRatio: number;
  /** Handle used for resize. */
  handle: HandlePosition;
}

// ── Service ─────────────────────────────────────────────────

@Injectable()
export class EditorStateService {
  // ── Selection ─────────────────────────────────────────────
  readonly selectedNodeId = signal<string | null>(null);
  readonly hoveredNodeId = signal<string | null>(null);
  readonly editingTextNodeId = signal<string | null>(null);
  readonly currentTool = signal<ToolType>('select');

  // ── Page Focus ────────────────────────────────────────────
  readonly currentPageId = signal<string | null>(null);
  readonly focusedPageId = signal<string | null>(null);

  // ── Gesture State ─────────────────────────────────────────
  readonly gestureType = signal<GestureType>('none');
  readonly liveTransform = signal<LiveTransform | null>(null);

  /** Stored at gesture start; NOT a signal (internal to gesture handling). */
  gestureStart: GestureStartState | null = null;

  // ── UI State ──────────────────────────────────────────────
  readonly isSpacePressed = signal(false);
  readonly isPanning = signal(false);

  // ── Computed ──────────────────────────────────────────────
  readonly isGesturing = computed(() => this.gestureType() !== 'none');
  readonly isDragging = computed(() => this.gestureType() === 'drag');

  // ── Methods ───────────────────────────────────────────────

  /** Start a gesture (drag, resize, rotate). */
  beginGesture(type: GestureType, startState: GestureStartState): void {
    this.gestureType.set(type);
    this.gestureStart = startState;
    this.liveTransform.set({
      nodeId: startState.nodeId,
      type,
      deltaPosition: Vec2Zero,
      deltaScale: { x: 1, y: 1 },
      deltaRotation: 0,
      handle: startState.handle,
    });
  }

  /** Update the live transform during a gesture (called on pointermove). */
  updateLiveTransform(update: Partial<Omit<LiveTransform, 'nodeId' | 'type'>>): void {
    const current = this.liveTransform();
    if (!current) return;
    this.liveTransform.set({ ...current, ...update });
  }

  /** End the current gesture. Returns the final transform for committing. */
  endGesture(): LiveTransform | null {
    const finalTransform = this.liveTransform();
    this.gestureType.set('none');
    this.liveTransform.set(null);
    this.gestureStart = null;
    return finalTransform;
  }

  /** Cancel the current gesture without committing. */
  cancelGesture(): void {
    this.gestureType.set('none');
    this.liveTransform.set(null);
    this.gestureStart = null;
  }

  /** Select a node and reset tool to 'select'. */
  selectNode(nodeId: string | null): void {
    this.selectedNodeId.set(nodeId);
    if (nodeId) {
      this.currentTool.set('select');
    }
  }

  /** Clear all editor state (used on page switch, load, etc). */
  reset(): void {
    this.selectedNodeId.set(null);
    this.hoveredNodeId.set(null);
    this.editingTextNodeId.set(null);
    this.currentTool.set('select');
    this.gestureType.set('none');
    this.liveTransform.set(null);
    this.gestureStart = null;
    this.isSpacePressed.set(false);
    this.isPanning.set(false);
  }
}
