/**
 * Lightweight 2D vector type used throughout the engine.
 *
 * Kept as a plain object (not a class) so it serializes naturally
 * with JSON and works seamlessly with Angular Signals / structuredClone.
 */

export interface Vec2 {
  readonly x: number;
  readonly y: number;
}

// ── Factories ───────────────────────────────────────────────

export function vec2(x: number, y: number): Vec2 {
  return { x, y };
}

export const Vec2Zero: Vec2 = { x: 0, y: 0 };
export const Vec2One: Vec2 = { x: 1, y: 1 };

// ── Arithmetic ──────────────────────────────────────────────

export function vec2Add(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x + b.x, y: a.y + b.y };
}

export function vec2Sub(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x - b.x, y: a.y - b.y };
}

export function vec2Scale(v: Vec2, s: number): Vec2 {
  return { x: v.x * s, y: v.y * s };
}

export function vec2Negate(v: Vec2): Vec2 {
  return { x: -v.x, y: -v.y };
}

export function vec2Length(v: Vec2): number {
  return Math.sqrt(v.x * v.x + v.y * v.y);
}

export function vec2Normalize(v: Vec2): Vec2 {
  const len = vec2Length(v);
  if (len === 0) return Vec2Zero;
  return { x: v.x / len, y: v.y / len };
}

export function vec2Dot(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x * b.x, y: a.y * b.y };
}

export function vec2Distance(a: Vec2, b: Vec2): number {
  return vec2Length(vec2Sub(a, b));
}

export function vec2Lerp(a: Vec2, b: Vec2, t: number): Vec2 {
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
  };
}

export function vec2Equals(a: Vec2, b: Vec2, epsilon = 1e-6): boolean {
  return Math.abs(a.x - b.x) < epsilon && Math.abs(a.y - b.y) < epsilon;
}

export function vec2Round(v: Vec2, decimals = 2): Vec2 {
  const f = Math.pow(10, decimals);
  return {
    x: Math.round(v.x * f) / f,
    y: Math.round(v.y * f) / f,
  };
}
