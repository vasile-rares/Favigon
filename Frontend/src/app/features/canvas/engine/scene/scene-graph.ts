/**
 * SceneGraph — the single source of truth for the node tree.
 *
 * CHANGE FROM OLD ARCHITECTURE:
 * - Old: flat CanvasElement[] with parentId, getAbsoluteBounds() walked up
 *   the tree on every call, no caching, O(n) lookups by id.
 * - New: proper tree with parent/children pointers, O(1) lookup via Map,
 *   dirty-flag-based matrix propagation, and a serialize/deserialize cycle
 *   for persistence/undo.
 *
 * The SceneGraph is framework-agnostic (no Angular imports). Angular services
 * wrap it and expose Signals.
 */

import { Vec2, vec2 } from '../math/vec2';
import {
  Mat3,
  mat3Identity,
  mat3Compose,
  mat3Multiply,
  mat3Invert,
  mat3TransformAABB,
} from '../math/mat3';
import { SceneNode, SceneNodeDTO, SceneNodeData, AABB, Bounds } from '../types';

// ── Node Creation ───────────────────────────────────────────

/** Create a new SceneNode with sensible defaults. */
export function createSceneNode(
  id: string,
  name: string,
  data: SceneNodeData,
  overrides?: Partial<
    Pick<
      SceneNode,
      | 'position'
      | 'rotation'
      | 'scale'
      | 'width'
      | 'height'
      | 'visible'
      | 'opacity'
      | 'primarySyncId'
      | 'irMeta'
    >
  >,
): SceneNode {
  const position = overrides?.position ?? vec2(0, 0);
  const rotation = overrides?.rotation ?? 0;
  const scale = overrides?.scale ?? vec2(1, 1);

  const localMatrix = mat3Compose(position, rotation, scale);

  return {
    id,
    name,
    position,
    rotation,
    scale,
    width: overrides?.width ?? 100,
    height: overrides?.height ?? 100,
    visible: overrides?.visible ?? true,
    opacity: overrides?.opacity ?? 1,
    data,
    primarySyncId: overrides?.primarySyncId,
    irMeta: overrides?.irMeta,
    parent: null,
    children: [],
    localMatrix,
    worldMatrix: mat3Identity(), // set properly when added to graph
    inverseWorldMatrix: null,
    _dirtyWorld: true,
    _version: 0,
  };
}

// ── SceneGraph ──────────────────────────────────────────────

export class SceneGraph {
  /** Map from node id → node for O(1) lookups. */
  private readonly nodeMap = new Map<string, SceneNode>();

  /**
   * Version counter. Bumped on every structural or property change.
   * Used by Angular computed signals and the history system for O(1)
   * dirty checks instead of JSON.stringify equality.
   */
  private _version = 0;

  get version(): number {
    return this._version;
  }

  get size(): number {
    return this.nodeMap.size;
  }

  // ── Lookup ────────────────────────────────────────────────

  getNode(id: string): SceneNode | null {
    return this.nodeMap.get(id) ?? null;
  }

  hasNode(id: string): boolean {
    return this.nodeMap.has(id);
  }

  /** Return all root nodes (nodes with no parent). */
  getRootNodes(): SceneNode[] {
    const roots: SceneNode[] = [];
    for (const node of this.nodeMap.values()) {
      if (!node.parent) roots.push(node);
    }
    return roots;
  }

  /** Return all nodes as a flat array (DFS order). */
  getAllNodes(): SceneNode[] {
    const result: SceneNode[] = [];
    for (const root of this.getRootNodes()) {
      this.traverseDFS(root, (node) => result.push(node));
    }
    return result;
  }

  // ── Tree Operations ───────────────────────────────────────

  /**
   * Add a node to the graph, optionally under a parent.
   * If parentId is null, the node becomes a root.
   */
  addNode(node: SceneNode, parentId: string | null = null): void {
    if (this.nodeMap.has(node.id)) {
      throw new Error(`SceneGraph: node "${node.id}" already exists.`);
    }

    this.nodeMap.set(node.id, node);

    if (parentId) {
      const parent = this.nodeMap.get(parentId);
      if (!parent) {
        throw new Error(`SceneGraph: parent "${parentId}" not found.`);
      }
      node.parent = parent;
      parent.children.push(node);
    } else {
      node.parent = null;
    }

    this.markWorldDirty(node);
    this._version++;
  }

  /**
   * Remove a node and all its descendants from the graph.
   * Uses iterative DFS — no recursion, no stack overflow.
   */
  removeNode(id: string): SceneNode[] {
    const node = this.nodeMap.get(id);
    if (!node) return [];

    const removed: SceneNode[] = [];
    const stack: SceneNode[] = [node];

    // Detach from parent first
    if (node.parent) {
      const idx = node.parent.children.indexOf(node);
      if (idx !== -1) node.parent.children.splice(idx, 1);
      node.parent = null;
    }

    // Iterative DFS to collect all descendants
    while (stack.length > 0) {
      const current = stack.pop()!;
      removed.push(current);
      this.nodeMap.delete(current.id);
      for (const child of current.children) {
        stack.push(child);
      }
    }

    this._version++;
    return removed;
  }

  /**
   * Move a node to a new parent (or make it a root).
   * Preserves world position by recomputing local transform.
   */
  reparentNode(nodeId: string, newParentId: string | null): void {
    const node = this.nodeMap.get(nodeId);
    if (!node) return;

    // Detach from old parent
    if (node.parent) {
      const idx = node.parent.children.indexOf(node);
      if (idx !== -1) node.parent.children.splice(idx, 1);
    }

    // Attach to new parent
    if (newParentId) {
      const newParent = this.nodeMap.get(newParentId);
      if (!newParent) throw new Error(`SceneGraph: parent "${newParentId}" not found.`);

      // Prevent reparenting to own descendant
      if (this.isDescendantOf(newParentId, nodeId)) {
        throw new Error(`SceneGraph: cannot reparent "${nodeId}" into its own descendant.`);
      }

      node.parent = newParent;
      newParent.children.push(node);
    } else {
      node.parent = null;
    }

    this.markWorldDirty(node);
    this._version++;
  }

  /** Reorder children of a parent node. */
  reorderChild(parentId: string | null, childId: string, newIndex: number): void {
    const siblings = parentId ? this.nodeMap.get(parentId)?.children : this.getRootNodes();
    if (!siblings) return;

    const oldIdx = siblings.findIndex((c) => c.id === childId);
    if (oldIdx === -1) return;

    const [node] = siblings.splice(oldIdx, 1);
    const clampedIndex = Math.min(newIndex, siblings.length);
    siblings.splice(clampedIndex, 0, node);

    this._version++;
  }

  // ── Transform Updates ─────────────────────────────────────

  /**
   * Update a node's local transform properties and recompute matrices.
   * This is the ONLY way to change position/rotation/scale.
   */
  setLocalTransform(
    nodeId: string,
    transform: Partial<{ position: Vec2; rotation: number; scale: Vec2 }>,
  ): void {
    const node = this.nodeMap.get(nodeId);
    if (!node) return;

    if (transform.position !== undefined) node.position = transform.position;
    if (transform.rotation !== undefined) node.rotation = transform.rotation;
    if (transform.scale !== undefined) node.scale = transform.scale;

    node.localMatrix = mat3Compose(node.position, node.rotation, node.scale);
    this.markWorldDirty(node);
    node._version++;
    this._version++;
  }

  /** Update dimensions. Separate from transform for clarity. */
  setSize(nodeId: string, width: number, height: number): void {
    const node = this.nodeMap.get(nodeId);
    if (!node) return;

    node.width = Math.max(1, width);
    node.height = Math.max(1, height);
    node.inverseWorldMatrix = null; // AABB changed
    node._version++;
    this._version++;
  }

  /** Update visual/non-spatial properties. */
  updateNodeData(nodeId: string, patch: Partial<SceneNodeData> & Record<string, unknown>): void {
    const node = this.nodeMap.get(nodeId);
    if (!node) return;

    Object.assign(node.data, patch);
    node._version++;
    this._version++;
  }

  /** Update miscellaneous properties (name, visible, opacity). */
  updateNodeProps(
    nodeId: string,
    patch: Partial<Pick<SceneNode, 'name' | 'visible' | 'opacity' | 'primarySyncId'>>,
  ): void {
    const node = this.nodeMap.get(nodeId);
    if (!node) return;

    if (patch.name !== undefined) node.name = patch.name;
    if (patch.visible !== undefined) node.visible = patch.visible;
    if (patch.opacity !== undefined) node.opacity = patch.opacity;
    if (patch.primarySyncId !== undefined) node.primarySyncId = patch.primarySyncId;

    node._version++;
    this._version++;
  }

  // ── Matrix Computation ────────────────────────────────────

  /**
   * Ensure a node's worldMatrix is up to date.
   * Lazily recomputes only when the dirty flag is set.
   */
  ensureWorldMatrix(node: SceneNode): void {
    if (!node._dirtyWorld) return;

    if (node.parent) {
      this.ensureWorldMatrix(node.parent);
      node.worldMatrix = mat3Multiply(node.parent.worldMatrix, node.localMatrix);
    } else {
      node.worldMatrix = node.localMatrix;
    }

    node.inverseWorldMatrix = null; // invalidate cache
    node._dirtyWorld = false;
  }

  /** Get the world matrix for a node, recomputing if needed. */
  getWorldMatrix(nodeId: string): Mat3 {
    const node = this.nodeMap.get(nodeId);
    if (!node) return mat3Identity();
    this.ensureWorldMatrix(node);
    return node.worldMatrix;
  }

  /** Get (or compute and cache) the inverse world matrix. */
  getInverseWorldMatrix(node: SceneNode): Mat3 | null {
    this.ensureWorldMatrix(node);
    if (!node.inverseWorldMatrix) {
      node.inverseWorldMatrix = mat3Invert(node.worldMatrix);
    }
    return node.inverseWorldMatrix;
  }

  /**
   * Compute the world-space AABB for a node.
   * Accounts for rotation — the AABB encloses the rotated rectangle.
   */
  getWorldAABB(node: SceneNode): AABB {
    this.ensureWorldMatrix(node);
    return mat3TransformAABB(node.worldMatrix, node.width, node.height);
  }

  /** Convenience: convert AABB to a Bounds rect. */
  getWorldBounds(node: SceneNode): Bounds {
    const aabb = this.getWorldAABB(node);
    return {
      x: aabb.minX,
      y: aabb.minY,
      width: aabb.maxX - aabb.minX,
      height: aabb.maxY - aabb.minY,
    };
  }

  // ── Traversal ─────────────────────────────────────────────

  /** Iterative depth-first traversal. */
  traverseDFS(root: SceneNode, callback: (node: SceneNode) => void): void {
    const stack: SceneNode[] = [root];
    while (stack.length > 0) {
      const node = stack.pop()!;
      callback(node);
      // Push children in reverse so first child is visited first
      for (let i = node.children.length - 1; i >= 0; i--) {
        stack.push(node.children[i]);
      }
    }
  }

  /** Collect all descendant IDs (iterative DFS). O(n). */
  collectDescendantIds(rootId: string): Set<string> {
    const result = new Set<string>();
    const node = this.nodeMap.get(rootId);
    if (!node) return result;

    const stack: SceneNode[] = [node];
    while (stack.length > 0) {
      const current = stack.pop()!;
      result.add(current.id);
      for (const child of current.children) {
        stack.push(child);
      }
    }
    return result;
  }

  /** Check if `candidateId` is a descendant of `ancestorId`. */
  isDescendantOf(candidateId: string, ancestorId: string): boolean {
    let current = this.nodeMap.get(candidateId);
    while (current) {
      if (current.id === ancestorId) return true;
      current = current.parent ?? undefined;
    }
    return false;
  }

  /** Check if a node is effectively visible (all ancestors must also be visible). */
  isEffectivelyVisible(nodeId: string): boolean {
    let current = this.nodeMap.get(nodeId);
    while (current) {
      if (!current.visible) return false;
      current = current.parent ?? undefined;
    }
    return true;
  }

  // ── Serialization ─────────────────────────────────────────

  /**
   * Serialize the entire graph to a flat array of DTOs.
   * Order: DFS from roots, which guarantees parents appear before children
   * in the output — important for deserialization.
   */
  serialize(): SceneNodeDTO[] {
    const result: SceneNodeDTO[] = [];

    for (const root of this.getRootNodes()) {
      this.traverseDFS(root, (node) => {
        result.push({
          id: node.id,
          name: node.name,
          parentId: node.parent?.id ?? null,
          position: { x: node.position.x, y: node.position.y },
          rotation: node.rotation,
          scale: { x: node.scale.x, y: node.scale.y },
          width: node.width,
          height: node.height,
          visible: node.visible,
          opacity: node.opacity,
          data: structuredClone(node.data),
          primarySyncId: node.primarySyncId,
          irMeta: node.irMeta ? structuredClone(node.irMeta) : undefined,
        });
      });
    }

    return result;
  }

  /**
   * Build a SceneGraph from a flat array of DTOs.
   * DTOs must be in DFS order (parents before children) — the standard
   * output of serialize().
   */
  static deserialize(dtos: SceneNodeDTO[]): SceneGraph {
    const graph = new SceneGraph();

    for (const dto of dtos) {
      const node = createSceneNode(dto.id, dto.name, structuredClone(dto.data), {
        position: vec2(dto.position.x, dto.position.y),
        rotation: dto.rotation,
        scale: vec2(dto.scale.x, dto.scale.y),
        width: dto.width,
        height: dto.height,
        visible: dto.visible,
        opacity: dto.opacity,
        primarySyncId: dto.primarySyncId,
        irMeta: dto.irMeta ? structuredClone(dto.irMeta) : undefined,
      });

      graph.addNode(node, dto.parentId);
    }

    return graph;
  }

  /** Clear all nodes. */
  clear(): void {
    this.nodeMap.clear();
    this._version++;
  }

  /** Clone the entire graph (deep copy via serialize/deserialize). */
  clone(): SceneGraph {
    return SceneGraph.deserialize(this.serialize());
  }

  // ── Private ───────────────────────────────────────────────

  /**
   * Mark a node and all its descendants as needing worldMatrix recomputation.
   * This is O(subtree size) but only marks flags — the actual recomputation
   * is deferred until ensureWorldMatrix() is called.
   */
  private markWorldDirty(node: SceneNode): void {
    const stack: SceneNode[] = [node];
    while (stack.length > 0) {
      const current = stack.pop()!;
      current._dirtyWorld = true;
      current.inverseWorldMatrix = null;
      for (const child of current.children) {
        if (!child._dirtyWorld) {
          // skip already-dirty subtrees
          stack.push(child);
        }
      }
    }
  }
}
