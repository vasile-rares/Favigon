import { CanvasShadowPreset } from '../../../core/models/canvas.models';
import { roundToTwoDecimals } from './canvas-math.util';

export type CanvasShadowPosition = 'outside' | 'inside';

export interface EditableCanvasShadow {
  position: CanvasShadowPosition;
  x: number;
  y: number;
  blur: number;
  spread: number;
  color: string;
}

type EditableCanvasShadowPreset = Exclude<CanvasShadowPreset, 'none'>;

const SHADOW_PRESET_CSS_MAP: Record<CanvasShadowPreset, string> = {
  none: 'none',
  sm: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
  md: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -2px rgba(0, 0, 0, 0.1)',
  lg: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -4px rgba(0, 0, 0, 0.1)',
  xl: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
};

const EDITABLE_SHADOW_PRESET_MAP: Record<EditableCanvasShadowPreset, EditableCanvasShadow> = {
  sm: { position: 'outside', x: 0, y: 1, blur: 2, spread: 0, color: 'rgba(0, 0, 0, 0.05)' },
  md: { position: 'outside', x: 0, y: 4, blur: 6, spread: -1, color: 'rgba(0, 0, 0, 0.1)' },
  lg: { position: 'outside', x: 0, y: 10, blur: 15, spread: -3, color: 'rgba(0, 0, 0, 0.1)' },
  xl: { position: 'outside', x: 0, y: 20, blur: 25, spread: -5, color: 'rgba(0, 0, 0, 0.1)' },
};

const SHADOW_VALUE_PATTERN =
  /^(inset\s+)?(-?(?:\d+|\d*\.\d+))px\s+(-?(?:\d+|\d*\.\d+))px\s+((?:\d+|\d*\.\d+))px\s+(-?(?:\d+|\d*\.\d+))px\s+(.+)$/i;

export const DEFAULT_EDITABLE_CANVAS_SHADOW: EditableCanvasShadow = {
  position: 'outside',
  x: 0,
  y: 12,
  blur: 24,
  spread: 0,
  color: 'rgba(0, 0, 0, 0.24)',
};

export function normalizeCanvasShadowValue(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const normalized = value.trim();
  if (!normalized || normalized.toLowerCase() === 'none') {
    return undefined;
  }

  return normalized;
}

export function hasCanvasShadow(value: unknown): boolean {
  return getCanvasShadowCss(value) !== 'none';
}

export function getCanvasShadowCss(value: unknown): string {
  if (typeof value !== 'string') {
    return 'none';
  }

  const normalized = value.trim();
  if (!normalized) {
    return 'none';
  }

  const preset = normalized.toLowerCase();
  return isCanvasShadowPreset(preset) ? SHADOW_PRESET_CSS_MAP[preset] : normalized;
}

export function resolveEditableCanvasShadow(
  value: unknown,
  fallback: EditableCanvasShadow = DEFAULT_EDITABLE_CANVAS_SHADOW,
): EditableCanvasShadow {
  if (typeof value !== 'string') {
    return copyEditableCanvasShadow(fallback);
  }

  const normalized = value.trim();
  if (!normalized) {
    return copyEditableCanvasShadow(fallback);
  }

  const preset = normalized.toLowerCase();
  if (isEditableCanvasShadowPreset(preset)) {
    return copyEditableCanvasShadow(EDITABLE_SHADOW_PRESET_MAP[preset]);
  }

  if (preset === 'none') {
    return copyEditableCanvasShadow(fallback);
  }

  const match = normalized.match(SHADOW_VALUE_PATTERN);
  if (!match) {
    return copyEditableCanvasShadow(fallback);
  }

  return {
    position: match[1] ? 'inside' : 'outside',
    x: roundToTwoDecimals(Number.parseFloat(match[2])),
    y: roundToTwoDecimals(Number.parseFloat(match[3])),
    blur: Math.max(0, roundToTwoDecimals(Number.parseFloat(match[4]))),
    spread: roundToTwoDecimals(Number.parseFloat(match[5])),
    color: match[6].trim() || fallback.color,
  };
}

export function buildCanvasShadowCss(shadow: EditableCanvasShadow): string {
  const prefix = shadow.position === 'inside' ? 'inset ' : '';
  const color = shadow.color.trim() || DEFAULT_EDITABLE_CANVAS_SHADOW.color;

  return `${prefix}${formatShadowNumber(shadow.x)}px ${formatShadowNumber(shadow.y)}px ${formatShadowNumber(Math.max(0, shadow.blur))}px ${formatShadowNumber(shadow.spread)}px ${color}`;
}

export function formatCanvasShadowSummary(value: unknown): string {
  if (!hasCanvasShadow(value)) {
    return 'None';
  }

  const shadow = resolveEditableCanvasShadow(value);
  const label = shadow.position === 'inside' ? 'Inside' : 'Outside';
  return `${label} (${formatShadowNumber(shadow.x)}, ${formatShadowNumber(shadow.y)}, ${formatShadowNumber(shadow.blur)}, ${formatShadowNumber(shadow.spread)})`;
}

function copyEditableCanvasShadow(shadow: EditableCanvasShadow): EditableCanvasShadow {
  return { ...shadow };
}

function formatShadowNumber(value: number): string {
  return roundToTwoDecimals(value).toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
}

function isCanvasShadowPreset(value: string): value is CanvasShadowPreset {
  return value === 'none' || value === 'sm' || value === 'md' || value === 'lg' || value === 'xl';
}

function isEditableCanvasShadowPreset(value: string): value is EditableCanvasShadowPreset {
  return value === 'sm' || value === 'md' || value === 'lg' || value === 'xl';
}
