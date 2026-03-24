/**
 * Engine — barrel export.
 *
 * Provides a single import path for all engine modules:
 *   import { SceneGraph, Camera2D, HitTester, ... } from '../engine';
 *
 * The engine is entirely framework-agnostic (no Angular/React/etc. dependency).
 * Angular-specific wrappers live in ../editor/.
 */

// Math
export {
  vec2Add,
  vec2Sub,
  vec2Scale,
  vec2Length,
  vec2Normalize,
  vec2Distance,
  vec2Lerp,
  vec2Equals,
  vec2Round,
  Vec2Zero,
  Vec2One,
} from './math/vec2';
export type { Vec2 } from './math/vec2';
export {
  mat3Identity,
  mat3Create,
  mat3Translate,
  mat3Rotate,
  mat3Scale,
  mat3Multiply,
  mat3Invert,
  mat3TransformPoint,
  mat3TransformVector,
  mat3Decompose,
  mat3Compose,
  mat3GetTranslation,
  mat3GetRotation,
  mat3Clone,
  mat3Equals,
  mat3ToCssMatrix,
  mat3TransformAABB,
} from './math/mat3';
export type { Mat3 } from './math/mat3';

// Types
export { isFrame, isText, isImage, isRectangle, isCircle, isGroup } from './types';
export type {
  NodeType,
  FrameData,
  RectangleData,
  CircleData,
  TextData,
  ImageData,
  GroupData,
  SceneNodeData,
  SceneNode,
  SceneNodeDTO,
  ViewportPreset,
  PageModel,
  ProjectDocument,
  AABB,
  Bounds,
} from './types';

// Scene Graph
export { SceneGraph } from './scene/scene-graph';

// Camera
export { Camera2D } from './camera/camera2d';

// Hit Testing
export { HitTester } from './hit-test/hit-tester';
export type { HitTestResult } from './hit-test/hit-tester';

// Render Cache
export { RenderCache } from './render/render-cache';
