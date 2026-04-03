import {
  CanvasConstraintSizeMode,
  CanvasElement,
  CanvasPageModel,
  CanvasSizeMode,
} from '../../../core/models/canvas.models';
import { roundToTwoDecimals } from './canvas-math.util';

export type CanvasSizeAxis = 'width' | 'height';
export type CanvasConstraintField = 'minWidth' | 'maxWidth' | 'minHeight' | 'maxHeight';

const DEFAULT_PAGE_WIDTH = 1280;
const DEFAULT_PAGE_HEIGHT = 720;

export function getCanvasSizeMode(
  element: Pick<CanvasElement, 'widthMode' | 'heightMode'>,
  axis: CanvasSizeAxis,
): CanvasSizeMode {
  return axis === 'width' ? (element.widthMode ?? 'fixed') : (element.heightMode ?? 'fixed');
}

export function getCanvasSizeModeField(axis: CanvasSizeAxis): 'widthMode' | 'heightMode' {
  return axis === 'width' ? 'widthMode' : 'heightMode';
}

export function getCanvasSizeValueField(
  axis: CanvasSizeAxis,
): 'widthSizingValue' | 'heightSizingValue' {
  return axis === 'width' ? 'widthSizingValue' : 'heightSizingValue';
}

export function getCanvasFixedSize(element: Pick<CanvasElement, 'width' | 'height'>, axis: CanvasSizeAxis): number {
  return axis === 'width' ? element.width : element.height;
}

export function getCanvasSizingValue(
  element: Pick<CanvasElement, 'widthSizingValue' | 'heightSizingValue'>,
  axis: CanvasSizeAxis,
): number | undefined {
  return axis === 'width' ? element.widthSizingValue : element.heightSizingValue;
}

export function getCanvasViewportSize(page: CanvasPageModel | null | undefined, axis: CanvasSizeAxis): number {
  return axis === 'width'
    ? (page?.viewportWidth ?? DEFAULT_PAGE_WIDTH)
    : (page?.viewportHeight ?? DEFAULT_PAGE_HEIGHT);
}

export function supportsCanvasSizeMode(
  mode: CanvasSizeMode,
  element: Pick<CanvasElement, 'type' | 'parentId' | 'position'>,
  parent: Pick<CanvasElement, 'id'> | null,
): boolean {
  switch (mode) {
    case 'fixed':
      return true;
    case 'relative':
      return !!parent && element.type !== 'frame';
    case 'fill':
      return (
        !!parent &&
        element.type !== 'frame' &&
        element.position !== 'absolute' &&
        element.position !== 'fixed'
      );
    case 'fit-content':
      return element.type === 'text' || element.type === 'image';
    case 'viewport':
      return !parent;
  }
}

export function normalizeCanvasSizeMode(
  mode: string | null | undefined,
  element: Pick<CanvasElement, 'type' | 'parentId' | 'position'>,
  parent: Pick<CanvasElement, 'id'> | null,
): CanvasSizeMode {
  if (
    mode === 'fixed' ||
    mode === 'relative' ||
    mode === 'fill' ||
    mode === 'fit-content' ||
    mode === 'viewport'
  ) {
    return supportsCanvasSizeMode(mode, element, parent) ? mode : 'fixed';
  }

  return 'fixed';
}

export function normalizeCanvasSizeValue(
  mode: CanvasSizeMode,
  value: number | null | undefined,
): number | undefined {
  if (mode === 'fixed' || mode === 'fit-content') {
    return undefined;
  }

  if (mode === 'fill') {
    return 100;
  }

  if (!Number.isFinite(value ?? Number.NaN)) {
    return undefined;
  }

  return Math.max(1, roundToTwoDecimals(value as number));
}

export function deriveCanvasSizeValueFromPixels(
  mode: CanvasSizeMode,
  pixels: number,
  axis: CanvasSizeAxis,
  parent: Pick<CanvasElement, 'width' | 'height'> | null,
  page: CanvasPageModel | null | undefined,
): number | undefined {
  if (mode === 'fixed' || mode === 'fit-content') {
    return undefined;
  }

  if (mode === 'fill') {
    return 100;
  }

  const base = mode === 'relative' ? getCanvasParentSize(parent, axis) : getCanvasViewportSize(page, axis);
  if (!base || base <= 0) {
    return undefined;
  }

  return Math.max(1, roundToTwoDecimals((pixels / base) * 100));
}

export function resolveCanvasPixelsFromMode(
  mode: CanvasSizeMode,
  fallbackPixels: number,
  axis: CanvasSizeAxis,
  sizingValue: number | undefined,
  parent: Pick<CanvasElement, 'width' | 'height'> | null,
  page: CanvasPageModel | null | undefined,
): number {
  if (mode === 'fixed' || mode === 'fit-content') {
    return fallbackPixels;
  }

  if (mode === 'fill') {
    const base = getCanvasParentSize(parent, axis);
    return base && base > 0 ? roundToTwoDecimals(base) : fallbackPixels;
  }

  const normalizedValue = normalizeCanvasSizeValue(mode, sizingValue);
  if (!normalizedValue) {
    return fallbackPixels;
  }

  const base = mode === 'relative' ? getCanvasParentSize(parent, axis) : getCanvasViewportSize(page, axis);
  if (!base || base <= 0) {
    return fallbackPixels;
  }

  return roundToTwoDecimals((base * normalizedValue) / 100);
}

export function getCanvasParentSize(
  parent: Pick<CanvasElement, 'width' | 'height'> | null,
  axis: CanvasSizeAxis,
): number | null {
  if (!parent) {
    return null;
  }

  return axis === 'width' ? parent.width : parent.height;
}

export function getCanvasSizeSuffix(mode: CanvasSizeMode, axis: CanvasSizeAxis): string | null {
  switch (mode) {
    case 'relative':
    case 'fill':
      return '%';
    case 'viewport':
      return axis === 'width' ? 'vw' : 'vh';
    default:
      return null;
  }
}

export function shouldDisableCanvasSizeInput(mode: CanvasSizeMode): boolean {
  return mode === 'fill' || mode === 'fit-content';
}

export function getCanvasConstraintAxis(field: CanvasConstraintField): CanvasSizeAxis {
  return field.toLowerCase().includes('width') ? 'width' : 'height';
}

export function getCanvasConstraintMode(
  element: Pick<
    CanvasElement,
    'minWidthMode' | 'maxWidthMode' | 'minHeightMode' | 'maxHeightMode'
  >,
  field: CanvasConstraintField,
): CanvasConstraintSizeMode {
  switch (field) {
    case 'minWidth':
      return element.minWidthMode ?? 'fixed';
    case 'maxWidth':
      return element.maxWidthMode ?? 'fixed';
    case 'minHeight':
      return element.minHeightMode ?? 'fixed';
    case 'maxHeight':
      return element.maxHeightMode ?? 'fixed';
  }
}

export function getCanvasConstraintModeField(
  field: CanvasConstraintField,
): 'minWidthMode' | 'maxWidthMode' | 'minHeightMode' | 'maxHeightMode' {
  switch (field) {
    case 'minWidth':
      return 'minWidthMode';
    case 'maxWidth':
      return 'maxWidthMode';
    case 'minHeight':
      return 'minHeightMode';
    case 'maxHeight':
      return 'maxHeightMode';
  }
}

export function getCanvasConstraintSizeValueField(
  field: CanvasConstraintField,
):
  | 'minWidthSizingValue'
  | 'maxWidthSizingValue'
  | 'minHeightSizingValue'
  | 'maxHeightSizingValue' {
  switch (field) {
    case 'minWidth':
      return 'minWidthSizingValue';
    case 'maxWidth':
      return 'maxWidthSizingValue';
    case 'minHeight':
      return 'minHeightSizingValue';
    case 'maxHeight':
      return 'maxHeightSizingValue';
  }
}

export function getCanvasConstraintValue(
  element: Pick<CanvasElement, 'minWidth' | 'maxWidth' | 'minHeight' | 'maxHeight'>,
  field: CanvasConstraintField,
): number | undefined {
  switch (field) {
    case 'minWidth':
      return element.minWidth;
    case 'maxWidth':
      return element.maxWidth;
    case 'minHeight':
      return element.minHeight;
    case 'maxHeight':
      return element.maxHeight;
  }
}

export function getCanvasConstraintSizingValue(
  element: Pick<
    CanvasElement,
    'minWidthSizingValue' | 'maxWidthSizingValue' | 'minHeightSizingValue' | 'maxHeightSizingValue'
  >,
  field: CanvasConstraintField,
): number | undefined {
  switch (field) {
    case 'minWidth':
      return element.minWidthSizingValue;
    case 'maxWidth':
      return element.maxWidthSizingValue;
    case 'minHeight':
      return element.minHeightSizingValue;
    case 'maxHeight':
      return element.maxHeightSizingValue;
  }
}

export function supportsCanvasConstraintSizeMode(
  mode: CanvasConstraintSizeMode,
  element: Pick<CanvasElement, 'type' | 'parentId' | 'position'>,
  parent: Pick<CanvasElement, 'id'> | null,
): boolean {
  switch (mode) {
    case 'fixed':
      return true;
    case 'relative':
      return !!parent && element.type !== 'frame';
  }
}

export function normalizeCanvasConstraintMode(
  mode: string | null | undefined,
  element: Pick<CanvasElement, 'type' | 'parentId' | 'position'>,
  parent: Pick<CanvasElement, 'id'> | null,
): CanvasConstraintSizeMode {
  if (mode === 'fixed' || mode === 'relative') {
    return supportsCanvasConstraintSizeMode(mode, element, parent) ? mode : 'fixed';
  }

  return 'fixed';
}

export function normalizeCanvasConstraintValue(
  mode: CanvasConstraintSizeMode,
  value: number | null | undefined,
): number | undefined {
  if (!Number.isFinite(value ?? Number.NaN)) {
    return undefined;
  }

  const normalized = Math.max(1, roundToTwoDecimals(value as number));
  return mode === 'fixed' || mode === 'relative' ? normalized : undefined;
}

export function deriveCanvasConstraintValueFromPixels(
  mode: CanvasConstraintSizeMode,
  pixels: number,
  axis: CanvasSizeAxis,
  parent: Pick<CanvasElement, 'width' | 'height'> | null,
): number | undefined {
  if (mode === 'fixed') {
    return undefined;
  }

  const base = getCanvasParentSize(parent, axis);
  if (!base || base <= 0) {
    return undefined;
  }

  return Math.max(1, roundToTwoDecimals((pixels / base) * 100));
}

export function resolveCanvasConstraintPixels(
  mode: CanvasConstraintSizeMode,
  fallbackPixels: number,
  axis: CanvasSizeAxis,
  sizingValue: number | undefined,
  parent: Pick<CanvasElement, 'width' | 'height'> | null,
): number {
  if (mode === 'fixed') {
    return roundToTwoDecimals(fallbackPixels);
  }

  const normalizedValue = normalizeCanvasConstraintValue(mode, sizingValue);
  if (!normalizedValue) {
    return roundToTwoDecimals(fallbackPixels);
  }

  const base = getCanvasParentSize(parent, axis);
  if (!base || base <= 0) {
    return roundToTwoDecimals(fallbackPixels);
  }

  return roundToTwoDecimals((base * normalizedValue) / 100);
}

export function getCanvasConstraintSuffix(mode: CanvasConstraintSizeMode): string | null {
  return mode === 'relative' ? '%' : null;
}