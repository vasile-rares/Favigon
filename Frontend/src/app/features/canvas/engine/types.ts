/**
 * Core engine types — framework-agnostic, no Angular dependency.
 *
 * CHANGE FROM OLD ARCHITECTURE:
 * - CanvasElement was a single fat interface with optional fields for every type.
 *   Now we use a discriminated union (`SceneNodeData`) so each type carries only
 *   the fields it actually needs, with full type narrowing at compile time.
 * - The old flat `CanvasElement[]` with `parentId` is replaced by a proper tree
 *   (SceneNode with parent/children refs). A flat serialization format is kept
 *   for persistence (SceneNodeDTO).
 */

import { Vec2 } from './math/vec2';
import { Mat3 } from './math/mat3';

// ── Element Types ───────────────────────────────────────────

export type NodeType = 'frame' | 'rectangle' | 'circle' | 'text' | 'image' | 'group';

// ── Per-Type Data (Discriminated Union) ─────────────────────

export interface FrameData {
  readonly type: 'frame';
  fill: string;
  stroke?: string;
  strokeWidth: number;
  strokeStyle: string;
  cornerRadius: number;
  isPrimary?: boolean;
  clipContent: boolean;
}

export interface RectangleData {
  readonly type: 'rectangle';
  fill: string;
  stroke?: string;
  strokeWidth: number;
  strokeStyle: string;
  cornerRadius: number;
}

export interface CircleData {
  readonly type: 'circle';
  fill: string;
  stroke?: string;
  strokeWidth: number;
  strokeStyle: string;
}

export interface TextData {
  readonly type: 'text';
  text: string;
  fill: string;
  fontSize: number;
  fontFamily: string;
  fontWeight: number;
  fontStyle: 'normal' | 'italic';
  textAlign: 'left' | 'center' | 'right';
  textVerticalAlign: 'top' | 'middle' | 'bottom';
  letterSpacing: number;
  lineHeight: number;
}

export interface ImageData {
  readonly type: 'image';
  imageUrl: string;
  cornerRadius: number;
  stroke?: string;
  strokeWidth: number;
  strokeStyle: string;
}

export interface GroupData {
  readonly type: 'group';
}

export type SceneNodeData =
  | FrameData
  | RectangleData
  | CircleData
  | TextData
  | ImageData
  | GroupData;

// ── Scene Node ──────────────────────────────────────────────

/**
 * A single node in the scene graph tree.
 *
 * ARCHITECTURAL DECISIONS:
 * - `localMatrix` and `worldMatrix` are computed from position/rotation/scale
 *   and cached. They're invalidated via a dirty flag propagated down the tree.
 * - `width` and `height` are local-space dimensions (before transforms).
 * - `parent` and `children` are runtime references, NOT serialized.
 *   Serialization uses SceneNodeDTO with parentId strings.
 */
export interface SceneNode {
  readonly id: string;
  name: string;

  // ── Local Transform Decomposed ────────────────────────────
  // These are the source of truth. localMatrix is computed from them.
  position: Vec2; // translation in parent space
  rotation: number; // radians
  scale: Vec2; // { x: 1, y: 1 } default

  // ── Dimensions ────────────────────────────────────────────
  width: number;
  height: number;

  // ── Visual Properties ─────────────────────────────────────
  visible: boolean;
  opacity: number;
  data: SceneNodeData;

  // ── Sync (for responsive device frame mirroring) ──────────
  primarySyncId?: string;

  // ── IR / code-gen metadata ────────────────────────────────
  irMeta?: {
    type?: string;
    props?: Record<string, unknown>;
    style?: Record<string, string>;
  };

  // ── Tree Pointers (runtime only, not serialized) ──────────
  parent: SceneNode | null;
  children: SceneNode[];

  // ── Cached Matrices ───────────────────────────────────────
  // Managed by the SceneGraph; do not set directly.
  localMatrix: Mat3;
  worldMatrix: Mat3;
  inverseWorldMatrix: Mat3 | null; // lazily computed on first hit-test
  _dirtyWorld: boolean; // true when worldMatrix needs recomputation
  _version: number; // bumped on any property change
}

// ── Serialization DTO (flat, JSON-safe) ─────────────────────

/**
 * Flat, JSON-serializable representation of a SceneNode.
 * Used for persistence and undo/redo snapshots.
 *
 * - parentId replaces parent/children references.
 * - Matrices are NOT serialized; they're recomputed on load.
 * - position/rotation/scale are stored as plain numbers.
 */
export interface SceneNodeDTO {
  id: string;
  name: string;
  parentId: string | null;
  position: { x: number; y: number };
  rotation: number;
  scale: { x: number; y: number };
  width: number;
  height: number;
  visible: boolean;
  opacity: number;
  data: SceneNodeData;
  primarySyncId?: string;
  irMeta?: SceneNode['irMeta'];
}

// ── Page Model ──────────────────────────────────────────────

export type ViewportPreset = 'desktop' | 'tablet' | 'mobile' | 'custom';

export interface PageModel {
  id: string;
  name: string;
  viewportPreset: ViewportPreset;
  viewportWidth: number;
  viewportHeight: number;
  canvasX: number;
  canvasY: number;
  nodes: SceneNodeDTO[];
}

export interface ProjectDocument {
  version: string;
  projectId: string;
  activePageId: string | null;
  pages: PageModel[];
}

// ── Bounds ───────────────────────────────────────────────────

export interface AABB {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

// ── Utility Type Guards ─────────────────────────────────────

export function isFrame(node: SceneNode): node is SceneNode & { data: FrameData } {
  return node.data.type === 'frame';
}

export function isText(node: SceneNode): node is SceneNode & { data: TextData } {
  return node.data.type === 'text';
}

export function isImage(node: SceneNode): node is SceneNode & { data: ImageData } {
  return node.data.type === 'image';
}

export function isRectangle(node: SceneNode): node is SceneNode & { data: RectangleData } {
  return node.data.type === 'rectangle';
}

export function isCircle(node: SceneNode): node is SceneNode & { data: CircleData } {
  return node.data.type === 'circle';
}

export function isGroup(node: SceneNode): node is SceneNode & { data: GroupData } {
  return node.data.type === 'group';
}
