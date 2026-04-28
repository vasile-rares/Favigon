import { clamp, roundToTwoDecimals } from '../canvas-math.util';
import type { Bounds, Point, ResizeState } from '../../canvas.types';

const MIN_RESIZE_SIZE = 1;

function calculateRotatedResizedBounds(
  start: ResizeState,
  pointer: Point,
  preserveAspectRatio: boolean,
  scaleFromCenter: boolean,
): Bounds {
  const rad = (start.rotation * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  // Local unit vectors in scene space (CSS clockwise rotation)
  const ux = cos; // local X (rightward in element)
  const uy = sin;
  const vx = -sin; // local Y (downward in element)
  const vy = cos;

  const cx = start.centerX;
  const cy = start.centerY;
  const w = start.width;
  const h = start.height;
  const dx = pointer.x - start.pointerX;
  const dy = pointer.y - start.pointerY;

  const handle = start.handle;
  const isEdgeHandle = handle === 'n' || handle === 's' || handle === 'e' || handle === 'w';
  // Sign of the drag handle on each local axis (0 = not on that axis edge)
  const hx = handle.includes('e') ? 1 : handle.includes('w') ? -1 : 0;
  const hy = handle.includes('s') ? 1 : handle.includes('n') ? -1 : 0;

  const minSize = MIN_RESIZE_SIZE;

  if (scaleFromCenter) {
    // Alt: resize from center – project delta onto local axes, apply symmetrically
    const localDx = dx * ux + dy * uy;
    const localDy = dx * vx + dy * vy;
    let newW = Math.max(minSize, w + (hx !== 0 ? hx * localDx * 2 : 0));
    let newH = Math.max(minSize, h + (hy !== 0 ? hy * localDy * 2 : 0));

    if (preserveAspectRatio && !isEdgeHandle) {
      const aspect = start.aspectRatio || 1;
      const scaleX = newW / Math.max(w, 1);
      const scaleY = newH / Math.max(h, 1);
      const scale = Math.max(
        minSize / Math.max(w, 1),
        Math.abs(scaleX - 1) >= Math.abs(scaleY - 1) ? scaleX : scaleY,
      );
      newW = Math.max(minSize, w * scale);
      newH = Math.max(minSize, newW / aspect);
    }

    return {
      x: roundToTwoDecimals(cx - newW / 2),
      y: roundToTwoDecimals(cy - newH / 2),
      width: roundToTwoDecimals(newW),
      height: roundToTwoDecimals(newH),
    };
  }

  // Normal resize: anchor the opposite corner/edge center in scene space.
  const anchorX = cx + ((-hx * w) / 2) * ux + ((-hy * h) / 2) * vx;
  const anchorY = cy + ((-hx * w) / 2) * uy + ((-hy * h) / 2) * vy;

  // Old handle position in scene space.
  const oldHandleX = cx + ((hx * w) / 2) * ux + ((hy * h) / 2) * vx;
  const oldHandleY = cy + ((hx * w) / 2) * uy + ((hy * h) / 2) * vy;

  // New handle position after mouse moved.
  const newHandleX = oldHandleX + dx;
  const newHandleY = oldHandleY + dy;

  // Diagonal vector from anchor to new handle.
  const diagX = newHandleX - anchorX;
  const diagY = newHandleY - anchorY;

  // Project onto local axes to get new dimensions.
  // The diagonal goes from anchor toward the handle; for handles in the -1 direction
  // (NW, N, W etc.) the vector is in the negative local-axis direction, so we multiply
  // by hx/hy to flip the sign and get the correct positive dimension.
  let newW = hx * (diagX * ux + diagY * uy); // dot(diag, localX) × hx-sign
  let newH = hy * (diagX * vx + diagY * vy); // dot(diag, localY) × hy-sign

  // Edge handles: keep the orthogonal dimension unchanged.
  if (hx === 0) newW = w;
  if (hy === 0) newH = h;

  if (preserveAspectRatio && !isEdgeHandle) {
    const aspect = start.aspectRatio || 1;
    const scaleX = newW / Math.max(w, 1);
    const scaleY = newH / Math.max(h, 1);
    const scale = Math.max(
      minSize / Math.max(w, 1),
      Math.abs(scaleX - 1) >= Math.abs(scaleY - 1) ? scaleX : scaleY,
    );
    newW = Math.max(minSize, w * scale);
    newH = Math.max(minSize, newW / aspect);
  }

  newW = Math.max(minSize, newW);
  newH = Math.max(minSize, newH);

  // New element center: move the anchor to the midpoint between anchor and new handle.
  const newCx = anchorX + ((hx * newW) / 2) * ux + ((hy * newH) / 2) * vx;
  const newCy = anchorY + ((hx * newW) / 2) * uy + ((hy * newH) / 2) * vy;

  // x/y = top-left of the *unrotated* bounding box (CSS left/top before transform).
  return {
    x: roundToTwoDecimals(newCx - newW / 2),
    y: roundToTwoDecimals(newCy - newH / 2),
    width: roundToTwoDecimals(newW),
    height: roundToTwoDecimals(newH),
  };
}

export function calculateResizedBounds(
  start: ResizeState,
  parentBounds: Bounds | null,
  pointer: Point,
  preserveAspectRatio: boolean,
  scaleFromCenter: boolean,
): Bounds {
  // Delegate to the rotation-aware implementation for rotated elements.
  if (start.rotation) {
    return calculateRotatedResizedBounds(start, pointer, preserveAspectRatio, scaleFromCenter);
  }

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
