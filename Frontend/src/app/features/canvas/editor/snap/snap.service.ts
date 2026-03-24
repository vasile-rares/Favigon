/**
 * SnapService — snap-to-guide system with cached candidates.
 *
 * CHANGES FROM OLD canvas-snap.util.ts:
 * - Old: `buildSnapCandidates()` was called every pointermove from the
 *   component, recomputing bounds for every sibling element each frame.
 * - New: candidates are built ONCE at drag-start via `cacheSnapCandidates()`
 *   and reused for the entire gesture. This is safe because other elements
 *   don't move during a drag.
 * - Snap computation itself is the same proven algorithm (3-edge test per axis),
 *   but is now a method on the service so it can read cached state.
 * - Uses RenderCache to get world AABB — no tree walk per-element.
 * - Rotation-aware: snaps to the axis-aligned bounding box (AABB) of the
 *   rotated element. For a non-rotated element, AABB === OBB.
 */

import { Injectable, signal } from '@angular/core';
import { SceneGraph } from '../../engine/scene/scene-graph';
import { RenderCache } from '../../engine/render/render-cache';
import { SceneNode } from '../../engine/types';

// ── Config ──────────────────────────────────────────────────

export const SNAP_THRESHOLD = 6; // canvas-space pixels

// ── Types ───────────────────────────────────────────────────

export interface SnapLine {
  type: 'vertical' | 'horizontal';
  position: number;
}

export interface SnapResult {
  /** Snapped world X for the element origin. */
  x: number;
  /** Snapped world Y for the element origin. */
  y: number;
  /** Active guide lines. */
  lines: SnapLine[];
}

interface SnapCandidate {
  /** X edges: left, centerX, right. */
  xEdges: number[];
  /** Y edges: top, centerY, bottom. */
  yEdges: number[];
}

// ── Service ─────────────────────────────────────────────────

@Injectable()
export class SnapService {
  /** Active snap lines displayed by the template. */
  readonly activeLines = signal<SnapLine[]>([]);

  /** Cached candidates built at drag-start. */
  private xCandidates: number[] = [];
  private yCandidates: number[] = [];

  // ── Public API ──────────────────────────────────────────

  /**
   * Build snap candidates for all sibling nodes of the dragged node.
   * Called ONCE at gesture start.
   *
   * @param graph         The current scene graph.
   * @param renderCache   Precomputed world bounds.
   * @param draggedNodeId The node being dragged (excluded from candidates).
   * @param scopeNodeId   If provided, limit candidates to children of this
   *                      parent (e.g. only snap to siblings inside a frame).
   *                      If null, candidates are all visible top-level nodes.
   */
  cacheSnapCandidates(
    graph: SceneGraph,
    renderCache: RenderCache,
    draggedNodeId: string,
    scopeNodeId: string | null = null,
  ): void {
    this.xCandidates = [];
    this.yCandidates = [];

    const excludeIds = new Set<string>();
    excludeIds.add(draggedNodeId);
    // Also exclude descendants of dragged node (they move with it).
    for (const id of graph.collectDescendantIds(draggedNodeId)) {
      excludeIds.add(id);
    }

    const candidateNodes: SceneNode[] = [];
    if (scopeNodeId) {
      const parent = graph.getNode(scopeNodeId);
      if (parent) {
        for (const child of parent.children) {
          if (!excludeIds.has(child.id) && graph.isEffectivelyVisible(child.id)) {
            candidateNodes.push(child);
          }
        }
      }
    } else {
      // All top-level nodes.
      for (const root of graph.getRootNodes()) {
        if (!excludeIds.has(root.id) && graph.isEffectivelyVisible(root.id)) {
          candidateNodes.push(root);
        }
      }
    }

    // Extract 3 edges per axis from the world AABB of each candidate.
    for (const node of candidateNodes) {
      const aabb = renderCache.getWorldAABB(node.id);
      if (!aabb) continue;

      const { minX, minY, maxX, maxY } = aabb;
      const cx = (minX + maxX) / 2;
      const cy = (minY + maxY) / 2;

      this.xCandidates.push(minX, cx, maxX);
      this.yCandidates.push(minY, cy, maxY);
    }
  }

  /**
   * Compute the snapped position for an element being dragged.
   *
   * @param worldX  Current world-space X origin of the element.
   * @param worldY  Current world-space Y origin of the element.
   * @param width   Element width (world-space).
   * @param height  Element height (world-space).
   * @param threshold  Snap distance in world-space pixels (default: 6).
   */
  computeSnap(
    worldX: number,
    worldY: number,
    width: number,
    height: number,
    threshold = SNAP_THRESHOLD,
  ): SnapResult {
    const dragEdgesX = [worldX, worldX + width / 2, worldX + width];
    const offsetsX = [0, width / 2, width];

    const dragEdgesY = [worldY, worldY + height / 2, worldY + height];
    const offsetsY = [0, height / 2, height];

    const snapX = this.findClosestSnap(dragEdgesX, offsetsX, this.xCandidates, threshold);
    const snapY = this.findClosestSnap(dragEdgesY, offsetsY, this.yCandidates, threshold);

    const lines: SnapLine[] = [];
    if (snapX) lines.push({ type: 'vertical', position: snapX.guidePosition });
    if (snapY) lines.push({ type: 'horizontal', position: snapY.guidePosition });

    this.activeLines.set(lines);

    return {
      x: snapX ? snapX.snappedOrigin : worldX,
      y: snapY ? snapY.snappedOrigin : worldY,
      lines,
    };
  }

  /** Clear candidates and guide lines (called at gesture end). */
  clear(): void {
    this.xCandidates = [];
    this.yCandidates = [];
    this.activeLines.set([]);
  }

  // ── Private ───────────────────────────────────────────────

  private findClosestSnap(
    dragEdges: number[],
    dragOffsets: number[],
    candidates: number[],
    threshold: number,
  ): { snappedOrigin: number; guidePosition: number } | null {
    let bestDelta = threshold;
    let result: { snappedOrigin: number; guidePosition: number } | null = null;

    for (const cand of candidates) {
      for (let i = 0; i < dragEdges.length; i++) {
        const delta = Math.abs(dragEdges[i] - cand);
        if (delta < bestDelta) {
          bestDelta = delta;
          result = {
            snappedOrigin: cand - dragOffsets[i],
            guidePosition: cand,
          };
        }
      }
    }

    return result;
  }
}
