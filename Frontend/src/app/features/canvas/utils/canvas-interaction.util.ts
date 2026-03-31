import { CanvasCornerRadii, CanvasElement } from '../../../core/models/canvas.models';
import { clamp, roundToTwoDecimals } from './canvas-math.util';

const MIN_SIZE = 24;

export function isPointInsideElement(x: number, y: number, element: CanvasElement): boolean {
  return (
    x >= element.x &&
    x <= element.x + element.width &&
    y >= element.y &&
    y <= element.y + element.height
  );
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
    letterSpacing:
      typeof element.letterSpacing === 'number'
        ? roundToTwoDecimals(element.letterSpacing)
        : undefined,
    lineHeight:
      typeof element.lineHeight === 'number' ? roundToTwoDecimals(element.lineHeight) : undefined,
    cornerRadius:
      typeof element.cornerRadius === 'number'
        ? roundToTwoDecimals(element.cornerRadius)
        : undefined,
    cornerRadii: element.cornerRadii
      ? roundCornerRadii(element.cornerRadii)
      : undefined,
  };
}

export function getDefaultCornerRadius(element: Pick<CanvasElement, 'type' | 'cornerRadius'>): number {
  return Number.isFinite(element.cornerRadius ?? Number.NaN)
    ? roundToTwoDecimals(element.cornerRadius as number)
    : element.type === 'image'
      ? 6
      : 0;
}

export function buildUniformCornerRadii(radius: number): CanvasCornerRadii {
  const normalizedRadius = Math.max(0, roundToTwoDecimals(radius));
  return {
    topLeft: normalizedRadius,
    topRight: normalizedRadius,
    bottomRight: normalizedRadius,
    bottomLeft: normalizedRadius,
  };
}

export function roundCornerRadii(radii: CanvasCornerRadii): CanvasCornerRadii {
  return {
    topLeft: Math.max(0, roundToTwoDecimals(radii.topLeft)),
    topRight: Math.max(0, roundToTwoDecimals(radii.topRight)),
    bottomRight: Math.max(0, roundToTwoDecimals(radii.bottomRight)),
    bottomLeft: Math.max(0, roundToTwoDecimals(radii.bottomLeft)),
  };
}

export function getResolvedCornerRadii(element: Pick<CanvasElement, 'type' | 'cornerRadius' | 'cornerRadii'>): CanvasCornerRadii {
  if (element.cornerRadii) {
    return roundCornerRadii(element.cornerRadii);
  }

  return buildUniformCornerRadii(getDefaultCornerRadius(element));
}

export function hasPerCornerRadius(
  element: Pick<CanvasElement, 'cornerRadii'>,
): boolean {
  return !!element.cornerRadii;
}

export function getElementBorderRadiusCss(
  element: Pick<CanvasElement, 'type' | 'cornerRadius' | 'cornerRadii'>,
): string {
  if (!hasPerCornerRadius(element)) {
    return `${getDefaultCornerRadius(element)}px`;
  }

  const radii = getResolvedCornerRadii(element);
  return `${radii.topLeft}px ${radii.topRight}px ${radii.bottomRight}px ${radii.bottomLeft}px`;
}

/** Mutates `element` in place to enforce minimum sizes, valid ranges, and frame constraints. */
export function mutateNormalizeElement(element: CanvasElement, elements: CanvasElement[]): void {
  element.width = Math.max(MIN_SIZE, element.width);
  element.height = Math.max(MIN_SIZE, element.height);

  if (element.type === 'text') {
    element.fontSizeUnit = element.fontSizeUnit === 'rem' ? 'rem' : 'px';
    element.letterSpacingUnit = element.letterSpacingUnit === 'em' ? 'em' : 'px';
    element.lineHeightUnit = element.lineHeightUnit === 'px' ? 'px' : 'em';
    element.fontSize = Math.max(
      element.fontSizeUnit === 'rem' ? 0.1 : 8,
      roundToTwoDecimals(element.fontSize ?? (element.fontSizeUnit === 'rem' ? 1 : 16)),
    );
    element.fontFamily = element.fontFamily?.trim() || 'Inter';
    element.fontWeight = [300, 400, 500, 600, 700].includes(element.fontWeight ?? 400)
      ? (element.fontWeight ?? 400)
      : 400;
    element.fontStyle = element.fontStyle === 'italic' ? 'italic' : 'normal';
    element.textAlign =
      element.textAlign === 'left' ||
      element.textAlign === 'right' ||
      element.textAlign === 'justify'
        ? element.textAlign
        : 'center';
    element.textVerticalAlign =
      element.textVerticalAlign === 'top' || element.textVerticalAlign === 'bottom'
        ? element.textVerticalAlign
        : 'middle';
    element.letterSpacing = roundToTwoDecimals(element.letterSpacing ?? 0);
    element.lineHeight = Math.max(
      element.lineHeightUnit === 'em' ? 0.8 : 1,
      roundToTwoDecimals(element.lineHeight ?? 1.2),
    );
  }

  const normalizedOpacity = Number.isFinite(element.opacity ?? Number.NaN)
    ? (element.opacity as number)
    : 1;
  element.opacity = clamp(normalizedOpacity, 0, 1);

  if (element.type !== 'text') {
    element.cornerRadius = getDefaultCornerRadius(element);
    element.cornerRadii = element.cornerRadii
      ? roundCornerRadii(element.cornerRadii)
      : undefined;
  }

  if (element.type !== 'text') {
    const normalizedStrokeWidth = Number.isFinite(element.strokeWidth ?? Number.NaN)
      ? (element.strokeWidth as number)
      : 1;
    element.strokeWidth = Math.max(0, roundToTwoDecimals(normalizedStrokeWidth));
  } else {
    element.strokeWidth = undefined;
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

  const maxWidth = Math.max(MIN_SIZE, parent.width - element.x);
  const maxHeight = Math.max(MIN_SIZE, parent.height - element.y);

  element.width = clamp(element.width, MIN_SIZE, maxWidth);
  element.height = clamp(element.height, MIN_SIZE, maxHeight);

  element.x = clamp(element.x, 0, parent.width - element.width);
  element.y = clamp(element.y, 0, parent.height - element.height);
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

// Re-exports for backward compatibility with existing imports
export { clamp, roundToTwoDecimals } from './canvas-math.util';
export { getAbsolutePos, collectSubtreeIds, removeWithChildren } from './canvas-tree.util';
