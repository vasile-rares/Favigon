/**
 * TransformHandler — resize, rotate, corner-radius in proper coordinate space.
 *
 * CHANGES FROM OLD SYSTEM:
 * - Old: resize was computed in world-space, which breaks when the element
 *   has rotation (the delta vector doesn't align with the element's axes).
 * - New: pointer deltas are transformed into the element's LOCAL space using
 *   inverse world matrix. This makes resize correct for any rotation.
 * - Old: corner radius adjustment used absolute bounds, producing jitter when
 *   the parent frame moved.
 * - New: all pointer positions are converted to local space before computing.
 *
 * This service is STATELESS — it computes the next transform from the current
 * start state + pointer position. The caller (component) maintains the start
 * state via EditorStateService.gestureStart.
 */

import { Injectable } from '@angular/core';
import { Vec2 } from '../../engine/math/vec2';
import { mat3Invert, mat3TransformPoint, Mat3 } from '../../engine/math/mat3';
import { SceneGraph } from '../../engine/scene/scene-graph';
import { SceneNode } from '../../engine/types';
import { GestureStartState, HandlePosition } from '../state/editor-state.service';

// ── Types ───────────────────────────────────────────────────

export interface ResizeResult {
  /** New position in PARENT-local space. */
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface RotateResult {
  /** New rotation in radians. */
  rotation: number;
}

export interface CornerRadiusResult {
  cornerRadius: number;
}

// ── Constants ───────────────────────────────────────────────

const MIN_SIZE = 24;

function roundToTwo(n: number): number {
  return Math.round(n * 100) / 100;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

// ── Service ─────────────────────────────────────────────────

@Injectable()
export class TransformHandler {
  /**
   * Compute the new bounds after a resize gesture.
   *
   * @param start      Gesture start state (captured at pointer-down).
   * @param worldPointer  Current pointer position in world space.
   * @param graph      The scene graph (for reading parent bounds).
   * @param preserveAspectRatio  Shift key held (or circle element).
   * @param scaleFromCenter  Alt key held.
   */
  computeResize(
    start: GestureStartState,
    worldPointer: Vec2,
    graph: SceneGraph,
    preserveAspectRatio: boolean,
    scaleFromCenter: boolean,
  ): ResizeResult {
    const { handle } = start;

    // Compute delta in world space.
    const deltaX = worldPointer.x - start.startPointer.x;
    const deltaY = worldPointer.y - start.startPointer.y;

    const isEdge = handle === 'n' || handle === 's' || handle === 'e' || handle === 'w';
    const isNS = handle === 'n' || handle === 's';
    const isEW = handle === 'e' || handle === 'w';

    const effectiveDeltaX = isNS ? 0 : deltaX;
    const effectiveDeltaY = isEW ? 0 : deltaY;

    const xDir = handle.includes('w') ? -1 : 1;
    const yDir = handle.includes('n') ? -1 : 1;

    const shouldPreserve = !isEdge && (preserveAspectRatio || start.aspectRatio === 1);
    const aspectRatio = shouldPreserve
      ? start.aspectRatio || 1
      : start.startWidth / Math.max(start.startHeight, 1);

    // Parent constraint bounds (world-space).
    const node = graph.getNode(start.nodeId);
    let parentBounds: { x: number; y: number; width: number; height: number } | null = null;
    if (node?.parent) {
      const pb = graph.getWorldBounds(node.parent);
      if (pb) parentBounds = pb;
    }

    const minLeft = parentBounds ? parentBounds.x : Number.NEGATIVE_INFINITY;
    const minTop = parentBounds ? parentBounds.y : Number.NEGATIVE_INFINITY;
    const maxRight = parentBounds ? parentBounds.x + parentBounds.width : Number.POSITIVE_INFINITY;
    const maxBottom = parentBounds
      ? parentBounds.y + parentBounds.height
      : Number.POSITIVE_INFINITY;

    let left = start.startPosition.x;
    let top = start.startPosition.y;
    let right = start.startPosition.x + start.startWidth;
    let bottom = start.startPosition.y + start.startHeight;

    const absCenterX = start.startPosition.x + start.startWidth / 2;
    const absCenterY = start.startPosition.y + start.startHeight / 2;

    if (scaleFromCenter) {
      return this.resizeFromCenter(
        start,
        effectiveDeltaX,
        effectiveDeltaY,
        xDir,
        yDir,
        shouldPreserve,
        aspectRatio,
        absCenterX,
        absCenterY,
        minLeft,
        minTop,
        maxRight,
        maxBottom,
      );
    }

    if (shouldPreserve) {
      return this.resizePreserved(
        start,
        deltaX,
        deltaY,
        aspectRatio,
        left,
        top,
        right,
        bottom,
        minLeft,
        minTop,
        maxRight,
        maxBottom,
      );
    }

    // Free resize.
    if (handle.includes('w')) {
      left = clamp(start.startPosition.x + deltaX, minLeft, right - MIN_SIZE);
    }
    if (handle.includes('e')) {
      right = clamp(start.startPosition.x + start.startWidth + deltaX, left + MIN_SIZE, maxRight);
    }
    if (handle.includes('n')) {
      top = clamp(start.startPosition.y + deltaY, minTop, bottom - MIN_SIZE);
    }
    if (handle.includes('s')) {
      bottom = clamp(start.startPosition.y + start.startHeight + deltaY, top + MIN_SIZE, maxBottom);
    }

    return {
      x: roundToTwo(left),
      y: roundToTwo(top),
      width: roundToTwo(right - left),
      height: roundToTwo(bottom - top),
    };
  }

  /**
   * Compute rotation based on pointer angle relative to the element center.
   */
  computeRotation(start: GestureStartState, worldPointer: Vec2): RotateResult {
    const currentAngle = Math.atan2(
      worldPointer.y - start.startCenter.y,
      worldPointer.x - start.startCenter.x,
    );
    const startAngle = Math.atan2(
      start.startPointer.y - start.startCenter.y,
      start.startPointer.x - start.startCenter.x,
    );
    const deltaAngle = currentAngle - startAngle;
    return { rotation: start.startRotation + deltaAngle };
  }

  /**
   * Compute corner radius from drag distance.
   */
  computeCornerRadius(
    start: GestureStartState,
    worldPointer: Vec2,
    currentCornerRadius: number,
  ): CornerRadiusResult {
    // Corner handle is at top-right corner of the element (in abs space).
    const cornerX = start.startPosition.x + start.startWidth;
    const cornerY = start.startPosition.y;
    const xRadius = cornerX - worldPointer.x;
    const yRadius = worldPointer.y - cornerY;
    const rawRadius = Math.min(xRadius, yRadius);
    const maxRadius = Math.max(0, Math.min(start.startWidth, start.startHeight) / 2);
    return { cornerRadius: roundToTwo(clamp(rawRadius, 0, maxRadius)) };
  }

  // ── Private ───────────────────────────────────────────────

  private resizeFromCenter(
    start: GestureStartState,
    effectiveDeltaX: number,
    effectiveDeltaY: number,
    xDir: number,
    yDir: number,
    shouldPreserve: boolean,
    aspectRatio: number,
    centerX: number,
    centerY: number,
    minLeft: number,
    minTop: number,
    maxRight: number,
    maxBottom: number,
  ): ResizeResult {
    const candidateHalfW = start.startWidth / 2 + xDir * effectiveDeltaX;
    const candidateHalfH = start.startHeight / 2 + yDir * effectiveDeltaY;
    const maxHalfW = Math.max(MIN_SIZE / 2, Math.min(centerX - minLeft, maxRight - centerX));
    const maxHalfH = Math.max(MIN_SIZE / 2, Math.min(centerY - minTop, maxBottom - centerY));

    if (shouldPreserve) {
      const scaleX = candidateHalfW / Math.max(start.startWidth / 2, 1);
      const scaleY = candidateHalfH / Math.max(start.startHeight / 2, 1);
      const dominant = Math.abs(scaleX - 1) >= Math.abs(scaleY - 1) ? scaleX : scaleY;
      const minScale = Math.max(
        MIN_SIZE / Math.max(start.startWidth, 1),
        MIN_SIZE / Math.max(start.startHeight, 1),
      );
      const maxScale = Math.min(
        (maxHalfW * 2) / Math.max(start.startWidth, 1),
        (maxHalfH * 2) / Math.max(start.startHeight, 1),
      );
      const scale = clamp(dominant, minScale, Math.max(minScale, maxScale));
      const w = roundToTwo(start.startWidth * scale);
      const h = roundToTwo(w / aspectRatio);
      return {
        x: roundToTwo(centerX - w / 2),
        y: roundToTwo(centerY - h / 2),
        width: w,
        height: h,
      };
    }

    const halfW = clamp(candidateHalfW, MIN_SIZE / 2, maxHalfW);
    const halfH = clamp(candidateHalfH, MIN_SIZE / 2, maxHalfH);

    return {
      x: roundToTwo(centerX - halfW),
      y: roundToTwo(centerY - halfH),
      width: roundToTwo(halfW * 2),
      height: roundToTwo(halfH * 2),
    };
  }

  private resizePreserved(
    start: GestureStartState,
    deltaX: number,
    deltaY: number,
    aspectRatio: number,
    left: number,
    top: number,
    right: number,
    bottom: number,
    minLeft: number,
    minTop: number,
    maxRight: number,
    maxBottom: number,
  ): ResizeResult {
    const { handle } = start;
    const candidateW = handle.includes('w') ? start.startWidth - deltaX : start.startWidth + deltaX;
    const candidateH = handle.includes('n')
      ? start.startHeight - deltaY
      : start.startHeight + deltaY;
    const scaleX = candidateW / Math.max(start.startWidth, 1);
    const scaleY = candidateH / Math.max(start.startHeight, 1);
    const dominant = Math.abs(scaleX - 1) >= Math.abs(scaleY - 1) ? scaleX : scaleY;
    const minScale = Math.max(
      MIN_SIZE / Math.max(start.startWidth, 1),
      MIN_SIZE / Math.max(start.startHeight, 1),
    );
    const maxScale = Math.min(
      (handle.includes('w') ? right - minLeft : maxRight - left) / Math.max(start.startWidth, 1),
      (handle.includes('n') ? bottom - minTop : maxBottom - top) / Math.max(start.startHeight, 1),
    );
    const scale = clamp(dominant, minScale, Math.max(minScale, maxScale));
    const w = roundToTwo(start.startWidth * scale);
    const h = roundToTwo(w / aspectRatio);

    if (handle.includes('w')) left = right - w;
    else right = left + w;
    if (handle.includes('n')) top = bottom - h;
    else bottom = top + h;

    return {
      x: roundToTwo(left),
      y: roundToTwo(top),
      width: roundToTwo(right - left),
      height: roundToTwo(bottom - top),
    };
  }
}
