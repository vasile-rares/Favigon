/**
 * HitTester — correct hit testing using inverse transforms.
 *
 * CHANGE FROM OLD ARCHITECTURE:
 * - Old: naive AABB test — `x >= element.x && x <= element.x + element.width`.
 *   This is wrong for rotated elements (tests the axis-aligned bounding box,
 *   not the actual rotated rectangle) and ignores parent transforms entirely.
 * - New: inverse-transform the world-space test point into the node's LOCAL
 *   space, then check against the simple rect [0, 0, width, height].
 *   This is correct for any combination of translation, rotation, and scale
 *   at any nesting depth.
 *
 * The algorithm:
 * 1. Compute the node's worldMatrix (parent * local, recursively)
 * 2. Invert the worldMatrix
 * 3. Transform the world-space point into local space: localPoint = inverse(worldMatrix) * worldPoint
 * 4. Test: 0 <= localPoint.x <= width && 0 <= localPoint.y <= height
 *
 * For broad-phase speed, we can first test against the world-space AABB
 * (which is fast but conservative), then do the precise local-space test
 * only for nodes that pass the broad phase.
 */

import { Vec2 } from '../math/vec2';
import { mat3TransformPoint, mat3TransformAABB } from '../math/mat3';
import { SceneNode, AABB } from '../types';
import { SceneGraph } from '../scene/scene-graph';

export interface HitTestResult {
  /** The deepest (topmost in render order) node that was hit. */
  node: SceneNode;
  /** The hit point in the node's local coordinate space. */
  localPoint: Vec2;
}

export class HitTester {
  /**
   * Find the topmost node at a world-space point.
   *
   * Traversal order: reverse DFS (last-rendered = topmost = checked first).
   * The first hit wins.
   *
   * @param graph       The scene graph to test against
   * @param worldPoint  Point in world coordinates
   * @param filter      Optional predicate to skip certain nodes (e.g. invisible ones)
   * @returns           The deepest hit node and the local-space hit point, or null
   */
  hitTest(
    graph: SceneGraph,
    worldPoint: Vec2,
    filter?: (node: SceneNode) => boolean,
  ): HitTestResult | null {
    // Collect all root nodes and process them in reverse render order
    const roots = graph.getRootNodes();

    for (let i = roots.length - 1; i >= 0; i--) {
      const result = this.hitTestNode(graph, roots[i], worldPoint, filter);
      if (result) return result;
    }

    return null;
  }

  /**
   * Find ALL nodes at a world-space point (not just the topmost).
   * Useful for drag-drop target detection (e.g. finding the smallest
   * containing frame for auto-grouping).
   */
  hitTestAll(
    graph: SceneGraph,
    worldPoint: Vec2,
    filter?: (node: SceneNode) => boolean,
  ): HitTestResult[] {
    const results: HitTestResult[] = [];
    const roots = graph.getRootNodes();

    for (const root of roots) {
      this.hitTestNodeAll(graph, root, worldPoint, filter, results);
    }

    return results;
  }

  /**
   * Test a single node: is the world point inside its local rect?
   */
  pointInNode(graph: SceneGraph, node: SceneNode, worldPoint: Vec2): boolean {
    const inverse = graph.getInverseWorldMatrix(node);
    if (!inverse) return false; // singular matrix (degenerate transform)

    const local = mat3TransformPoint(inverse, worldPoint);
    return local.x >= 0 && local.x <= node.width && local.y >= 0 && local.y <= node.height;
  }

  // ── Private ───────────────────────────────────────────────

  /**
   * Recursive hit test on a subtree (reverse child order for topmost-first).
   */
  private hitTestNode(
    graph: SceneGraph,
    node: SceneNode,
    worldPoint: Vec2,
    filter?: (node: SceneNode) => boolean,
  ): HitTestResult | null {
    // Skip invisible or filtered-out nodes
    if (!node.visible) return null;
    if (filter && !filter(node)) return null;

    // Broad phase: AABB test to quickly skip nodes far from the point
    if (!this.pointInAABB(graph.getWorldAABB(node), worldPoint)) {
      return null;
    }

    // Check children first (reverse order = topmost first)
    for (let i = node.children.length - 1; i >= 0; i--) {
      const childResult = this.hitTestNode(graph, node.children[i], worldPoint, filter);
      if (childResult) return childResult;
    }

    // Then check this node itself (precise local-space test)
    const inverse = graph.getInverseWorldMatrix(node);
    if (!inverse) return null;

    const local = mat3TransformPoint(inverse, worldPoint);
    if (local.x >= 0 && local.x <= node.width && local.y >= 0 && local.y <= node.height) {
      return { node, localPoint: local };
    }

    return null;
  }

  /** Collect ALL hits in a subtree. */
  private hitTestNodeAll(
    graph: SceneGraph,
    node: SceneNode,
    worldPoint: Vec2,
    filter: ((node: SceneNode) => boolean) | undefined,
    results: HitTestResult[],
  ): void {
    if (!node.visible) return;
    if (filter && !filter(node)) return;

    // Broad phase
    if (!this.pointInAABB(graph.getWorldAABB(node), worldPoint)) return;

    // Precise test
    const inverse = graph.getInverseWorldMatrix(node);
    if (inverse) {
      const local = mat3TransformPoint(inverse, worldPoint);
      if (local.x >= 0 && local.x <= node.width && local.y >= 0 && local.y <= node.height) {
        results.push({ node, localPoint: local });
      }
    }

    // Children
    for (const child of node.children) {
      this.hitTestNodeAll(graph, child, worldPoint, filter, results);
    }
  }

  /** Cheap AABB containment test (broad phase). */
  private pointInAABB(aabb: AABB, point: Vec2): boolean {
    return (
      point.x >= aabb.minX && point.x <= aabb.maxX && point.y >= aabb.minY && point.y <= aabb.maxY
    );
  }
}
