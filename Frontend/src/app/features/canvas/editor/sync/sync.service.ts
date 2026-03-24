/**
 * SyncService — primary-frame element mirroring.
 *
 * Extracted from canvas-page.component.ts (~200 lines of private methods).
 *
 * CONCEPT:
 * The user designates one root frame as "primary". When an element is created
 * inside the primary frame, synced copies are automatically placed inside
 * every other root frame with proportional positioning. When the primary
 * element moves/resizes, its copies follow. When the primary frame itself
 * resizes, all synced children re-anchor proportionally.
 *
 * CHANGES FROM OLD SYSTEM:
 * - Old: sync logic was embedded as private methods in the 2800-line component.
 * - New: standalone stateless service. All methods are pure functions over the
 *   SceneGraph — they read state, return mutations, and let the caller apply.
 * - Uses SceneGraph traversal instead of flat array filter + find.
 * - Uses the engine's `FrameData.isPrimary` field on SceneNodeData.
 * - Bug fix: `getPrimaryFrame` used to compare `el.name?.toLowerCase() ===
 *   'desktop'` against the display title, which never matched because
 *   ElementService generates titles like "Desktop - 1440×900". Now we only
 *   check the `isPrimary` flag or fall back to the first root frame.
 */

import { Injectable } from '@angular/core';
import { SceneGraph } from '../../engine/scene/scene-graph';
import { SceneNode, FrameData } from '../../engine/types';

// ── Helpers ─────────────────────────────────────────────────

function roundToTwo(n: number): number {
  return Math.round(n * 100) / 100;
}

// ── Service ─────────────────────────────────────────────────

@Injectable()
export class SyncService {
  /**
   * Find the primary root frame on this page.
   * Priority: explicit isPrimary flag → first root frame → null.
   */
  getPrimaryFrame(graph: SceneGraph): SceneNode | null {
    const rootFrames = graph.getRootNodes().filter((n: SceneNode) => n.data.type === 'frame');
    return (
      rootFrames.find((n: SceneNode) => (n.data as FrameData).isPrimary) ?? rootFrames[0] ?? null
    );
  }

  /**
   * Get all root frames that are NOT the primary frame.
   */
  getOtherRootFrames(graph: SceneGraph, primaryId: string): SceneNode[] {
    return graph
      .getRootNodes()
      .filter((n: SceneNode) => n.data.type === 'frame' && n.id !== primaryId);
  }

  /**
   * Set one frame as primary, clearing the flag on all others.
   * Returns the list of [nodeId, isPrimary] patches.
   */
  setPrimaryFrame(
    graph: SceneGraph,
    frameId: string,
  ): Array<{ nodeId: string; isPrimary: boolean }> {
    const patches: Array<{ nodeId: string; isPrimary: boolean }> = [];

    for (const root of graph.getRootNodes()) {
      if (root.data.type !== 'frame') continue;
      const data = root.data as FrameData;
      const shouldBePrimary = root.id === frameId;
      if (data.isPrimary !== shouldBePrimary) {
        patches.push({ nodeId: root.id, isPrimary: shouldBePrimary });
      }
    }

    return patches;
  }

  /**
   * When a new element is created inside the primary frame, produce synced
   * copies for every other root frame. Returns the new nodes to add.
   */
  createSyncedCopies(
    graph: SceneGraph,
    newNode: SceneNode,
  ): Array<{
    parentId: string;
    data: SceneNode['data'];
    position: { x: number; y: number };
    width: number;
    height: number;
    primarySyncId: string;
  }> {
    const primary = this.getPrimaryFrame(graph);
    if (!primary || newNode.parent?.id !== primary.id) return [];

    const others = this.getOtherRootFrames(graph, primary.id);

    return others.map((frame) => {
      return {
        parentId: frame.id,
        data: { ...newNode.data } as SceneNode['data'],
        position: {
          x:
            primary.width > 0
              ? roundToTwo((newNode.position.x / primary.width) * frame.width)
              : newNode.position.x,
          y:
            primary.height > 0
              ? roundToTwo((newNode.position.y / primary.height) * frame.height)
              : newNode.position.y,
        },
        width: newNode.width,
        height: newNode.height,
        primarySyncId: newNode.id,
      };
    });
  }

  /**
   * After moving/resizing a primary-frame child, update all its synced copies
   * proportionally. Returns patches to apply.
   */
  syncElementMoveToPrimary(
    graph: SceneGraph,
    movedNode: SceneNode,
  ): Array<{
    nodeId: string;
    position: { x: number; y: number };
    width: number;
    height: number;
  }> {
    const primary = this.getPrimaryFrame(graph);
    if (!primary || movedNode.parent?.id !== primary.id) return [];

    const others = this.getOtherRootFrames(graph, primary.id);
    const patches: Array<{
      nodeId: string;
      position: { x: number; y: number };
      width: number;
      height: number;
    }> = [];

    // Find all synced copies of this element.
    for (const frame of others) {
      for (const child of frame.children) {
        if (child.primarySyncId !== movedNode.id) continue;
        patches.push({
          nodeId: child.id,
          position: {
            x:
              primary.width > 0
                ? roundToTwo((movedNode.position.x / primary.width) * frame.width)
                : movedNode.position.x,
            y:
              primary.height > 0
                ? roundToTwo((movedNode.position.y / primary.height) * frame.height)
                : movedNode.position.y,
          },
          width: movedNode.width,
          height: movedNode.height,
        });
      }
    }

    return patches;
  }

  /**
   * After resizing the primary frame itself, re-anchor all synced copies
   * proportionally. Returns patches.
   */
  syncPrimaryFrameResize(
    graph: SceneGraph,
    resizedFrameId: string,
  ): Array<{
    nodeId: string;
    position: { x: number; y: number };
  }> {
    const primary = this.getPrimaryFrame(graph);
    if (!primary || resizedFrameId !== primary.id) return [];

    const newW = primary.width;
    const newH = primary.height;
    const others = this.getOtherRootFrames(graph, primary.id);

    const patches: Array<{
      nodeId: string;
      position: { x: number; y: number };
    }> = [];

    for (const frame of others) {
      for (const child of frame.children) {
        const syncId = child.primarySyncId;
        if (!syncId) continue;
        const source = graph.getNode(syncId);
        if (!source) continue;

        patches.push({
          nodeId: child.id,
          position: {
            x: newW > 0 ? roundToTwo((source.position.x / newW) * frame.width) : child.position.x,
            y: newH > 0 ? roundToTwo((source.position.y / newH) * frame.height) : child.position.y,
          },
        });
      }
    }

    return patches;
  }

  /**
   * When a node changes parent, check if sync links should break.
   */
  breakSyncOnParentChange(
    graph: SceneGraph,
    nodeId: string,
    prevParentId: string | null,
  ): string[] {
    const node = graph.getNode(nodeId);
    if (!node) return [];

    const currentParentId = node.parent?.id ?? null;
    if (currentParentId === prevParentId) return [];

    const primary = this.getPrimaryFrame(graph);

    // Synced copy moved out → clear its own sync link.
    if (node.primarySyncId) {
      return [nodeId];
    }

    // Primary element moved out of primary frame → break all copies.
    if (primary && prevParentId === primary.id && currentParentId !== primary.id) {
      const broken: string[] = [];
      for (const root of graph.getRootNodes()) {
        graph.traverseDFS(root, (n: SceneNode) => {
          if (n.primarySyncId === nodeId) {
            broken.push(n.id);
          }
        });
      }
      return broken;
    }

    return [];
  }
}
