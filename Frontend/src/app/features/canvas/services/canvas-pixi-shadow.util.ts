/**
 * Parses a CSS box-shadow string into parameters suitable for PixiJS DropShadowFilter.
 * Handles single shadow values only (first layer of multi-shadow).
 */
export interface PixiShadowParams {
  x: number;
  y: number;
  blur: number;
  color: number;
  alpha: number;
}

const SHADOW_PATTERN =
  /^(inset\s+)?(-?[\d.]+)px\s+(-?[\d.]+)px\s+([\d.]+)px\s+(-?[\d.]+)px\s+(.+)$/i;

const RGBA_PATTERN = /rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+))?\s*\)/i;

export function parseShadowParams(shadow: string | undefined | null): PixiShadowParams | null {
  if (!shadow || shadow === 'none') return null;

  // Take first shadow layer if multi-shadow
  const firstLayer = shadow.split(/,(?![^(]*\))/).map((s) => s.trim())[0];
  if (!firstLayer) return null;

  const match = SHADOW_PATTERN.exec(firstLayer);
  if (!match) return null;

  // Skip inset shadows (PixiJS DropShadowFilter is outer-only)
  if (match[1]) return null;

  const x = parseFloat(match[2]);
  const y = parseFloat(match[3]);
  const blur = parseFloat(match[4]);
  const colorStr = match[6].trim();

  const { color, alpha } = parseCssColor(colorStr);

  return { x, y, blur, color, alpha };
}

function parseCssColor(colorStr: string): { color: number; alpha: number } {
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
    if (hex.length === 8) {
      const color = parseInt(hex.slice(0, 6), 16);
      const alpha = parseInt(hex.slice(6, 8), 16) / 255;
      return { color, alpha };
    }
    return { color: parseInt(hex, 16) || 0, alpha: 1 };
  }

  return { color: 0x000000, alpha: 1 };
}
