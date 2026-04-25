import { roundToTwoDecimals } from '../canvas-math.util';

export interface EditableTextShadow {
  x: number;
  y: number;
  blur: number;
  color: string;
}

export const DEFAULT_EDITABLE_TEXT_SHADOW: EditableTextShadow = {
  x: 0,
  y: 2,
  blur: 4,
  color: 'rgba(0, 0, 0, 0.4)',
};

// Pattern: "<x>px <y>px <blur>px <color>"
const TEXT_SHADOW_PATTERN =
  /^(-?(?:\d+|\d*\.\d+))px\s+(-?(?:\d+|\d*\.\d+))px\s+((?:\d+|\d*\.\d+))px\s+(.+)$/i;

export function normalizeTextShadowValue(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim();
  if (!normalized || normalized.toLowerCase() === 'none') return undefined;
  return normalized;
}

export function hasTextShadow(value: unknown): boolean {
  return !!normalizeTextShadowValue(value);
}

export function buildTextShadowCss(shadow: EditableTextShadow): string {
  const x = roundToTwoDecimals(shadow.x);
  const y = roundToTwoDecimals(shadow.y);
  const blur = roundToTwoDecimals(Math.max(0, shadow.blur));
  return `${x}px ${y}px ${blur}px ${shadow.color}`;
}

export function resolveEditableTextShadow(
  value: unknown,
  fallback: EditableTextShadow = DEFAULT_EDITABLE_TEXT_SHADOW,
): EditableTextShadow {
  if (typeof value !== 'string') return copyEditableTextShadow(fallback);
  const normalized = value.trim();
  if (!normalized || normalized.toLowerCase() === 'none') return copyEditableTextShadow(fallback);

  const match = normalized.match(TEXT_SHADOW_PATTERN);
  if (!match) return copyEditableTextShadow(fallback);

  const x = Number(match[1]);
  const y = Number(match[2]);
  const blur = Number(match[3]);
  const color = match[4].trim();

  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(blur)) {
    return copyEditableTextShadow(fallback);
  }

  return {
    x: roundToTwoDecimals(x),
    y: roundToTwoDecimals(y),
    blur: roundToTwoDecimals(blur),
    color,
  };
}

function copyEditableTextShadow(shadow: EditableTextShadow): EditableTextShadow {
  return { ...shadow };
}

/**
 * Builds a CSS mask-image data URL for a squircle shape.
 * squircle is 0–100 (0 = no effect, 100 = maximum corner smoothing).
 */
export function buildSquircleMaskImage(squircle: number): string {
  const s = Math.max(0, Math.min(100, squircle)) / 100;
  if (s <= 0) return '';

  // In a 0-1 normalised viewBox:
  // r = corner radius (0..0.45)
  // p = how far along each edge the curve starts  (> r at high smoothing = squircle)
  // c = cubic bezier handle distance
  const r = s * 0.45;
  const p = Math.min(r * (1 + s * 0.75), 0.499);
  const c = Math.min(r * (0.55 + s * 0.35), p);

  const fmt = (n: number) => n.toFixed(5).replace(/0+$/, '').replace(/\.$/, '');

  const d = [
    `M ${fmt(p)} 0`,
    `H ${fmt(1 - p)}`,
    `C ${fmt(1 - p + c)} 0 1 ${fmt(p - c)} 1 ${fmt(p)}`,
    `V ${fmt(1 - p)}`,
    `C 1 ${fmt(1 - p + c)} ${fmt(1 - p + c)} 1 ${fmt(1 - p)} 1`,
    `H ${fmt(p)}`,
    `C ${fmt(p - c)} 1 0 ${fmt(1 - p + c)} 0 ${fmt(1 - p)}`,
    `V ${fmt(p)}`,
    `C 0 ${fmt(p - c)} ${fmt(p - c)} 0 ${fmt(p)} 0`,
    `Z`,
  ].join(' ');

  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1 1'><path d='${d}' fill='black'/></svg>`;
  return `url("data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}")`;
}
