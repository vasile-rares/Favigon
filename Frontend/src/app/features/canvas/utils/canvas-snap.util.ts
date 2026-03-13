import { CanvasElement } from '../../../core/models/canvas.models';
import { Bounds, SnapLine } from '../canvas.types';

export const SNAP_THRESHOLD = 6; // canvas-space pixels

export interface SnapResult {
  x: number;
  y: number;
  lines: SnapLine[];
}

function findClosestSnap(
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
        result = { snappedOrigin: cand - dragOffsets[i], guidePosition: cand };
      }
    }
  }

  return result;
}

export function computeSnappedPosition(
  absX: number,
  absY: number,
  width: number,
  height: number,
  xCandidates: number[],
  yCandidates: number[],
  threshold = SNAP_THRESHOLD,
): SnapResult {
  // The three X edges of the dragged element: left, center, right
  const dragEdgesX = [absX, absX + width / 2, absX + width];
  const offsetsX = [0, width / 2, width];

  // The three Y edges of the dragged element: top, center, bottom
  const dragEdgesY = [absY, absY + height / 2, absY + height];
  const offsetsY = [0, height / 2, height];

  const snapX = findClosestSnap(dragEdgesX, offsetsX, xCandidates, threshold);
  const snapY = findClosestSnap(dragEdgesY, offsetsY, yCandidates, threshold);

  const lines: SnapLine[] = [];
  if (snapX) lines.push({ type: 'vertical', position: snapX.guidePosition });
  if (snapY) lines.push({ type: 'horizontal', position: snapY.guidePosition });

  return {
    x: snapX ? snapX.snappedOrigin : absX,
    y: snapY ? snapY.snappedOrigin : absY,
    lines,
  };
}

export function buildSnapCandidates(
  draggedId: string,
  elements: CanvasElement[],
  getBounds: (el: CanvasElement, elements: CanvasElement[]) => Bounds,
): { xCandidates: number[]; yCandidates: number[] } {
  const xCandidates: number[] = [];
  const yCandidates: number[] = [];

  for (const el of elements) {
    if (el.id === draggedId) continue;
    if (el.visible === false) continue;

    const b = getBounds(el, elements);
    xCandidates.push(b.x, b.x + b.width / 2, b.x + b.width);
    yCandidates.push(b.y, b.y + b.height / 2, b.y + b.height);
  }

  return { xCandidates, yCandidates };
}
