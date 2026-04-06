import { clamp, roundToTwoDecimals } from './canvas-math.util';
import type { Bounds, Point, ResizeState } from '../canvas.types';

const MIN_RESIZE_SIZE = 1;

export function calculateResizedBounds(
  start: ResizeState,
  parentBounds: Bounds | null,
  pointer: Point,
  preserveAspectRatio: boolean,
  scaleFromCenter: boolean,
): Bounds {
  const minSize = MIN_RESIZE_SIZE;
  const deltaX = pointer.x - start.pointerX;
  const deltaY = pointer.y - start.pointerY;
  const isEdgeHandle =
    start.handle === 'n' || start.handle === 's' || start.handle === 'e' || start.handle === 'w';
  const isNS = start.handle === 'n' || start.handle === 's';
  const isEW = start.handle === 'e' || start.handle === 'w';
  const lockVerticalResize = false;
  const effectiveDeltaX = isNS ? 0 : deltaX;
  const effectiveDeltaY = isEW ? 0 : deltaY;
  const xDirection = start.handle.includes('w') ? -1 : 1;
  const yDirection = start.handle.includes('n') ? -1 : 1;
  const shouldPreserveAspectRatio = !isEdgeHandle && preserveAspectRatio;
  const aspectRatio = shouldPreserveAspectRatio
    ? start.aspectRatio || 1
    : start.width / Math.max(start.height, 1);

  let left = start.absoluteX;
  let top = start.absoluteY;
  let right = start.absoluteX + start.width;
  let bottom = start.absoluteY + start.height;

  const minLeft = parentBounds ? parentBounds.x : Number.NEGATIVE_INFINITY;
  const minTop = parentBounds ? parentBounds.y : Number.NEGATIVE_INFINITY;
  const maxRight = parentBounds ? parentBounds.x + parentBounds.width : Number.POSITIVE_INFINITY;
  const maxBottom = parentBounds ? parentBounds.y + parentBounds.height : Number.POSITIVE_INFINITY;

  if (scaleFromCenter) {
    const candidateHalfWidth = start.width / 2 + xDirection * effectiveDeltaX;
    const candidateHalfHeight = start.height / 2 + yDirection * effectiveDeltaY;
    const maxHalfWidth = Math.max(
      minSize / 2,
      Math.min(start.centerX - minLeft, maxRight - start.centerX),
    );
    const maxHalfHeight = Math.max(
      minSize / 2,
      Math.min(start.centerY - minTop, maxBottom - start.centerY),
    );

    if (shouldPreserveAspectRatio) {
      const scaleX = candidateHalfWidth / Math.max(start.width / 2, 1);
      const scaleY = candidateHalfHeight / Math.max(start.height / 2, 1);
      const dominantScale = Math.abs(scaleX - 1) >= Math.abs(scaleY - 1) ? scaleX : scaleY;
      const minScale = Math.max(
        minSize / Math.max(start.width, 1),
        minSize / Math.max(start.height, 1),
      );
      const maxScale = Math.min(
        (maxHalfWidth * 2) / Math.max(start.width, 1),
        (maxHalfHeight * 2) / Math.max(start.height, 1),
      );
      const scale = clamp(dominantScale, minScale, Math.max(minScale, maxScale));
      const width = roundToTwoDecimals(start.width * scale);
      const height = roundToTwoDecimals(width / aspectRatio);

      return {
        x: roundToTwoDecimals(start.centerX - width / 2),
        y: roundToTwoDecimals(start.centerY - height / 2),
        width,
        height,
      };
    }

    const halfWidth = clamp(candidateHalfWidth, minSize / 2, maxHalfWidth);
    const halfHeight = clamp(candidateHalfHeight, minSize / 2, maxHalfHeight);

    return {
      x: roundToTwoDecimals(start.centerX - halfWidth),
      y: roundToTwoDecimals(start.centerY - halfHeight),
      width: roundToTwoDecimals(halfWidth * 2),
      height: roundToTwoDecimals(halfHeight * 2),
    };
  }

  if (shouldPreserveAspectRatio) {
    const candidateWidth = start.handle.includes('w') ? start.width - deltaX : start.width + deltaX;
    const candidateHeight = start.handle.includes('n')
      ? start.height - deltaY
      : start.height + deltaY;
    const scaleX = candidateWidth / Math.max(start.width, 1);
    const scaleY = candidateHeight / Math.max(start.height, 1);
    const dominantScale = Math.abs(scaleX - 1) >= Math.abs(scaleY - 1) ? scaleX : scaleY;
    const minScale = Math.max(
      minSize / Math.max(start.width, 1),
      minSize / Math.max(start.height, 1),
    );
    const maxScale = Math.min(
      (start.handle.includes('w') ? right - minLeft : maxRight - left) / Math.max(start.width, 1),
      (start.handle.includes('n') ? bottom - minTop : maxBottom - top) / Math.max(start.height, 1),
    );
    const scale = clamp(dominantScale, minScale, Math.max(minScale, maxScale));
    const width = roundToTwoDecimals(start.width * scale);
    const height = roundToTwoDecimals(width / aspectRatio);

    if (start.handle.includes('w')) {
      left = right - width;
    } else {
      right = left + width;
    }

    if (start.handle.includes('n')) {
      top = bottom - height;
    } else {
      bottom = top + height;
    }

    return {
      x: roundToTwoDecimals(left),
      y: roundToTwoDecimals(top),
      width: roundToTwoDecimals(right - left),
      height: roundToTwoDecimals(bottom - top),
    };
  }

  if (start.handle.includes('w')) {
    left = clamp(start.absoluteX + deltaX, minLeft, right - minSize);
  }

  if (start.handle.includes('e')) {
    right = clamp(start.absoluteX + start.width + deltaX, left + minSize, maxRight);
  }

  if (start.handle.includes('n') && !lockVerticalResize) {
    top = clamp(start.absoluteY + deltaY, minTop, bottom - minSize);
  }

  if (start.handle.includes('s') && !lockVerticalResize) {
    bottom = clamp(start.absoluteY + start.height + deltaY, top + minSize, maxBottom);
  }

  return {
    x: roundToTwoDecimals(left),
    y: roundToTwoDecimals(top),
    width: roundToTwoDecimals(right - left),
    height: roundToTwoDecimals(bottom - top),
  };
}
