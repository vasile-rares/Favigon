/**
 * Parses a CSS box-shadow string into parameters suitable for PixiJS rendering.
 * Supports multiple shadow layers, inset, and spread.
 */
export interface PixiShadowParams {
  x: number;
  y: number;
  blur: number;
  spread: number;
  color: number;
  alpha: number;
  inset: boolean;
}

export interface PixiColorParams {
  color: number;
  alpha: number;
}

const SHADOW_PATTERN =
  /^(inset\s+)?(-?[\d.]+)px\s+(-?[\d.]+)px\s+([\d.]+)px\s+(-?[\d.]+)px\s+(.+)$/i;

const RGBA_PATTERN = /rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+))?\s*\)/i;

export function parseShadowParams(shadow: string | undefined | null): PixiShadowParams | null {
  const all = parseAllShadowParams(shadow);
  return all.length > 0 ? all[0] : null;
}

/**
 * Parses ALL shadow layers from a CSS box-shadow string.
 * Supports multi-shadow, inset, and spread.
 */
export function parseAllShadowParams(shadow: string | undefined | null): PixiShadowParams[] {
  if (!shadow || shadow === 'none') return [];

  const layers = shadow.split(/,(?![^(]*\))/).map((s) => s.trim());
  const results: PixiShadowParams[] = [];

  for (const layer of layers) {
    if (!layer) continue;
    const match = SHADOW_PATTERN.exec(layer);
    if (!match) continue;

    const isInset = !!match[1];
    const x = parseFloat(match[2]);
    const y = parseFloat(match[3]);
    const blur = parseFloat(match[4]);
    const spread = parseFloat(match[5]);
    const colorStr = match[6].trim();
    const { color, alpha } = parsePixiCssColor(colorStr);

    results.push({ x, y, blur, spread, color, alpha, inset: isInset });
  }

  return results;
}

export function parsePixiCssColor(colorStr: string): PixiColorParams {
  const normalized = colorStr.trim();
  if (!normalized) {
    return { color: 0x000000, alpha: 1 };
  }

  if (normalized.toLowerCase() === 'transparent') {
    return { color: 0x000000, alpha: 0 };
  }

  const resolved = resolveBrowserCssColor(normalized);
  if (resolved) {
    return parsePixiCssColorLiteral(resolved);
  }

  return parsePixiCssColorLiteral(normalized);
}

function parsePixiCssColorLiteral(colorStr: string): PixiColorParams {
  const rgbaMatch = RGBA_PATTERN.exec(colorStr);
  if (rgbaMatch) {
    const r = Math.round(parseFloat(rgbaMatch[1]));
    const g = Math.round(parseFloat(rgbaMatch[2]));
    const b = Math.round(parseFloat(rgbaMatch[3]));
    const a = rgbaMatch[4] !== undefined ? parseFloat(rgbaMatch[4]) : 1;
    return { color: (r << 16) | (g << 8) | b, alpha: a };
  }

  // Hex color
  if (colorStr.startsWith('#')) {
    let hex = colorStr.slice(1);
    if (hex.length === 3) {
      hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
    }
    if (hex.length === 4) {
      hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2] + hex[3] + hex[3];
    }
    if (hex.length === 8) {
      const color = parseInt(hex.slice(0, 6), 16);
      const alpha = parseInt(hex.slice(6, 8), 16) / 255;
      return { color, alpha };
    }
    return { color: parseInt(hex, 16) || 0, alpha: 1 };
  }

  return { color: 0x000000, alpha: 1 };
}

function resolveBrowserCssColor(colorStr: string): string | null {
  if (typeof document === 'undefined') {
    return null;
  }

  const context = getColorProbeContext();
  if (!context) {
    return null;
  }

  context.fillStyle = '#000000';
  context.fillStyle = colorStr;
  return typeof context.fillStyle === 'string' ? context.fillStyle : null;
}

let colorProbeContext: CanvasRenderingContext2D | null | undefined;

function getColorProbeContext(): CanvasRenderingContext2D | null {
  if (colorProbeContext !== undefined) {
    return colorProbeContext;
  }

  const canvas = document.createElement('canvas');
  colorProbeContext = canvas.getContext('2d');
  return colorProbeContext;
}
