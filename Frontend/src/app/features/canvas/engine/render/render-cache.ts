/**
 * RenderCache — memoizes computed values that are expensive to recalculate
 * on every Angular change detection cycle.
 *
 * CHANGE FROM OLD ARCHITECTURE:
 * - Old: getRenderedX/Y, getAbsoluteBounds, getPageShellLeft/Top/Width/Height
 *   were all called as template methods. Each call walked the tree. For N elements,
 *   a single CD cycle triggered ~4N tree walks.
 * - New: RenderCache precomputes all world bounds once per frame (when the
 *   scene graph version changes) and stores them in a Map. Template methods
 *   read from the cache in O(1).
 *
 * The cache is versioned: if sceneGraph.version hasn't changed since the last
 * compute, the cached values are returned immediately.
 */

import { SceneGraph } from '../scene/scene-graph';
import { SceneNode, AABB, Bounds } from '../types';

export class RenderCache {
  private _graphVersion = -1;
  private _boundsMap = new Map<string, Bounds>();
  private _aabbMap = new Map<string, AABB>();

  /**
   * Recompute cached bounds if the scene graph has changed.
   * Call this once at the start of each render cycle (e.g. in a computed signal).
   *
   * @returns true if the cache was refreshed, false if it was still valid.
   */
  update(graph: SceneGraph): boolean {
    if (graph.version === this._graphVersion) {
      return false;
    }

    this._boundsMap.clear();
    this._aabbMap.clear();

    for (const root of graph.getRootNodes()) {
      graph.traverseDFS(root, (node) => {
        const aabb = graph.getWorldAABB(node);
        this._aabbMap.set(node.id, aabb);
        this._boundsMap.set(node.id, {
          x: aabb.minX,
          y: aabb.minY,
          width: aabb.maxX - aabb.minX,
          height: aabb.maxY - aabb.minY,
        });
      });
    }

    this._graphVersion = graph.version;
    return true;
  }

  /** Get cached world bounds for a node (O(1)). */
  getWorldBounds(nodeId: string): Bounds | null {
    return this._boundsMap.get(nodeId) ?? null;
  }

  /** Get cached world AABB for a node (O(1)). */
  getWorldAABB(nodeId: string): AABB | null {
    return this._aabbMap.get(nodeId) ?? null;
  }

  /** Clear the cache. */
  invalidate(): void {
    this._graphVersion = -1;
    this._boundsMap.clear();
    this._aabbMap.clear();
  }
}
