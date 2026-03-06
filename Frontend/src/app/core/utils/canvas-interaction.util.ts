import { CanvasElement, CanvasStrokePosition } from '../models/canvas.models';

const MIN_SIZE = 24;

export function isPointInsideElement(x: number, y: number, element: CanvasElement): boolean {
  return (
    x >= element.x &&
    x <= element.x + element.width &&
    y >= element.y &&
    y <= element.y + element.height
  );
}

export function clamp(value: number, min: number, max: number): number {
  return roundToTwoDecimals(Math.min(Math.max(value, min), max));
}

export function roundToTwoDecimals(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function withRoundedPrecision(element: CanvasElement): CanvasElement {
  return {
    ...element,
    x: roundToTwoDecimals(element.x),
    y: roundToTwoDecimals(element.y),
    width: roundToTwoDecimals(element.width),
    height: roundToTwoDecimals(element.height),
    strokeWidth:
      typeof element.strokeWidth === 'number' ? roundToTwoDecimals(element.strokeWidth) : undefined,
    fontSize:
      typeof element.fontSize === 'number' ? roundToTwoDecimals(element.fontSize) : undefined,
  };
}

export function normalizeElementInPlace(element: CanvasElement, elements: CanvasElement[]): void {
  element.width = Math.max(MIN_SIZE, element.width);
  element.height = Math.max(MIN_SIZE, element.height);

  if (element.type === 'text') {
    element.fontSize = Math.max(8, element.fontSize ?? 16);
  }

  if (element.type === 'circle') {
    const circleSize = Math.max(MIN_SIZE, Math.min(element.width, element.height));
    element.width = circleSize;
    element.height = circleSize;
  }

  const normalizedOpacity = Number.isFinite(element.opacity ?? Number.NaN)
    ? (element.opacity as number)
    : 1;
  element.opacity = clamp(normalizedOpacity, 0, 1);

  if (element.type !== 'circle' && element.type !== 'text') {
    const normalizedCornerRadius = Number.isFinite(element.cornerRadius ?? Number.NaN)
      ? (element.cornerRadius as number)
      : element.type === 'image'
        ? 6
        : 0;
    element.cornerRadius = Math.max(0, roundToTwoDecimals(normalizedCornerRadius));
  }

  if (element.type !== 'text') {
    const normalizedStrokeWidth = Number.isFinite(element.strokeWidth ?? Number.NaN)
      ? (element.strokeWidth as number)
      : 1;
    element.strokeWidth = Math.max(0, roundToTwoDecimals(normalizedStrokeWidth));
    element.strokePosition = getStrokePosition(element);
  } else {
    element.strokeWidth = undefined;
    element.strokePosition = undefined;
  }

  const parent = element.parentId
    ? elements.find((candidate) => candidate.id === element.parentId)
    : null;

  if (!parent || element.type === 'frame') {
    element.x = roundToTwoDecimals(element.x);
    element.y = roundToTwoDecimals(element.y);
    element.width = roundToTwoDecimals(element.width);
    element.height = roundToTwoDecimals(element.height);
    if (typeof element.fontSize === 'number') {
      element.fontSize = roundToTwoDecimals(element.fontSize);
    }
    return;
  }

  const maxWidth = Math.max(MIN_SIZE, parent.x + parent.width - element.x);
  const maxHeight = Math.max(MIN_SIZE, parent.y + parent.height - element.y);

  element.width = clamp(element.width, MIN_SIZE, maxWidth);
  element.height = clamp(element.height, MIN_SIZE, maxHeight);

  if (element.type === 'circle') {
    const constrainedCircleSize = Math.max(MIN_SIZE, Math.min(element.width, element.height));
    element.width = constrainedCircleSize;
    element.height = constrainedCircleSize;
  }

  element.x = clamp(element.x, parent.x, parent.x + parent.width - element.width);
  element.y = clamp(element.y, parent.y, parent.y + parent.height - element.height);
  element.x = roundToTwoDecimals(element.x);
  element.y = roundToTwoDecimals(element.y);
  element.width = roundToTwoDecimals(element.width);
  element.height = roundToTwoDecimals(element.height);
  if (typeof element.fontSize === 'number') {
    element.fontSize = roundToTwoDecimals(element.fontSize);
  }
}

export function getStrokeWidth(element: CanvasElement): number {
  if (typeof element.strokeWidth === 'number' && Number.isFinite(element.strokeWidth)) {
    return Math.max(0, element.strokeWidth);
  }

  return 1;
}

export function getStrokePosition(element: CanvasElement): CanvasStrokePosition {
  return element.strokePosition === 'outside' ? 'outside' : 'inside';
}

export function collectDescendantIds(elements: CanvasElement[], rootId: string): Set<string> {
  const descendants = new Set<string>();
  let added = true;

  while (added) {
    added = false;
    for (const element of elements) {
      if (!element.parentId) {
        continue;
      }

      const isDirectChild = element.parentId === rootId;
      const isNestedChild = descendants.has(element.parentId);

      if ((isDirectChild || isNestedChild) && !descendants.has(element.id)) {
        descendants.add(element.id);
        added = true;
      }
    }
  }

  return descendants;
}

export function removeWithChildren(elements: CanvasElement[], rootId: string): CanvasElement[] {
  const idsToRemove = collectDescendantIds(elements, rootId);
  idsToRemove.add(rootId);

  return elements.filter((element) => !idsToRemove.has(element.id));
}
