/**
 * 3×3 matrix for 2D affine transforms.
 *
 * Layout (column-major, matching WebGL / standard math convention):
 *
 *   | m[0]  m[3]  m[6] |     | a  c  tx |
 *   | m[1]  m[4]  m[7] |  =  | b  d  ty |
 *   | m[2]  m[5]  m[8] |     | 0  0  1  |
 *
 * Stored as a plain Float64Array(9) for performance.
 * All functions are pure — they return new arrays, never mutating inputs.
 */

import { Vec2 } from './vec2';

export type Mat3 = Float64Array;

// ── Factory ─────────────────────────────────────────────────

/** Returns a new identity matrix. */
export function mat3Identity(): Mat3 {
  const m = new Float64Array(9);
  m[0] = 1;
  m[4] = 1;
  m[8] = 1;
  return m;
}

/** Creates a Mat3 from individual values (column-major). */
export function mat3Create(
  a: number,
  b: number,
  c: number,
  d: number,
  tx: number,
  ty: number,
): Mat3 {
  const m = new Float64Array(9);
  m[0] = a;
  m[1] = b;
  m[2] = 0;
  m[3] = c;
  m[4] = d;
  m[5] = 0;
  m[6] = tx;
  m[7] = ty;
  m[8] = 1;
  return m;
}

// ── Primitive Transforms ────────────────────────────────────

/** Translation matrix. */
export function mat3Translate(tx: number, ty: number): Mat3 {
  return mat3Create(1, 0, 0, 1, tx, ty);
}

/**
 * Rotation matrix.
 * @param radians  Rotation angle in radians (counter-clockwise).
 */
export function mat3Rotate(radians: number): Mat3 {
  const c = Math.cos(radians);
  const s = Math.sin(radians);
  return mat3Create(c, s, -s, c, 0, 0);
}

/** Scale matrix. */
export function mat3Scale(sx: number, sy: number): Mat3 {
  return mat3Create(sx, 0, 0, sy, 0, 0);
}

// ── Composition ─────────────────────────────────────────────

/**
 * Multiply two 3×3 matrices:  result = A * B
 *
 * Composes transforms so that B is applied first, then A.
 * This is the standard convention: worldMatrix = parent * local.
 */
export function mat3Multiply(a: Mat3, b: Mat3): Mat3 {
  const out = new Float64Array(9);
  out[0] = a[0] * b[0] + a[3] * b[1]; // + a[6]*b[2]=0
  out[1] = a[1] * b[0] + a[4] * b[1];
  out[2] = 0;
  out[3] = a[0] * b[3] + a[3] * b[4];
  out[4] = a[1] * b[3] + a[4] * b[4];
  out[5] = 0;
  out[6] = a[0] * b[6] + a[3] * b[7] + a[6];
  out[7] = a[1] * b[6] + a[4] * b[7] + a[7];
  out[8] = 1;
  return out;
}

/**
 * Invert a 2D affine matrix.
 * Returns null if the matrix is singular (determinant ≈ 0).
 */
export function mat3Invert(m: Mat3): Mat3 | null {
  const a = m[0],
    b = m[1];
  const c = m[3],
    d = m[4];
  const tx = m[6],
    ty = m[7];

  const det = a * d - b * c;
  if (Math.abs(det) < 1e-12) {
    return null;
  }

  const invDet = 1 / det;
  const out = new Float64Array(9);
  out[0] = d * invDet;
  out[1] = -b * invDet;
  out[2] = 0;
  out[3] = -c * invDet;
  out[4] = a * invDet;
  out[5] = 0;
  out[6] = (c * ty - d * tx) * invDet;
  out[7] = (b * tx - a * ty) * invDet;
  out[8] = 1;
  return out;
}

// ── Point Transforms ────────────────────────────────────────

/** Transform a point by a matrix:  result = M * [x, y, 1]ᵀ */
export function mat3TransformPoint(m: Mat3, p: Vec2): Vec2 {
  return {
    x: m[0] * p.x + m[3] * p.y + m[6],
    y: m[1] * p.x + m[4] * p.y + m[7],
  };
}

/**
 * Transform a direction vector (ignores translation).
 * Useful for computing sizes in world space.
 */
export function mat3TransformVector(m: Mat3, v: Vec2): Vec2 {
  return {
    x: m[0] * v.x + m[3] * v.y,
    y: m[1] * v.x + m[4] * v.y,
  };
}

// ── Decompose ───────────────────────────────────────────────

export interface Mat3Decomposed {
  translation: Vec2;
  rotation: number; // radians
  scale: Vec2;
}

/**
 * Decompose an affine matrix into translation, rotation, scale.
 * Assumes no skew. Rotation is in radians.
 */
export function mat3Decompose(m: Mat3): Mat3Decomposed {
  const a = m[0],
    b = m[1];
  const c = m[3],
    d = m[4];

  const sx = Math.sqrt(a * a + b * b);
  const sy = Math.sqrt(c * c + d * d);

  // Sign correction: if determinant is negative, one axis is flipped.
  const det = a * d - b * c;
  const signX = det < 0 ? -1 : 1;

  const rotation = Math.atan2(b, a);

  return {
    translation: { x: m[6], y: m[7] },
    rotation,
    scale: { x: sx * signX, y: sy },
  };
}

// ── Compose ─────────────────────────────────────────────────

/**
 * Build a local transform matrix from position, rotation (radians), and scale.
 *
 * Equivalent to: Translate(tx, ty) * Rotate(θ) * Scale(sx, sy)
 */
export function mat3Compose(translation: Vec2, rotation: number, scale: Vec2): Mat3 {
  const c = Math.cos(rotation);
  const s = Math.sin(rotation);
  return mat3Create(
    c * scale.x,
    s * scale.x,
    -s * scale.y,
    c * scale.y,
    translation.x,
    translation.y,
  );
}

// ── Helpers ─────────────────────────────────────────────────

/** Extract translation component from a matrix. */
export function mat3GetTranslation(m: Mat3): Vec2 {
  return { x: m[6], y: m[7] };
}

/** Extract rotation (radians) from a matrix. */
export function mat3GetRotation(m: Mat3): number {
  return Math.atan2(m[1], m[0]);
}

/** Clone a matrix. */
export function mat3Clone(m: Mat3): Mat3 {
  return new Float64Array(m);
}

/** Check approximate equality. */
export function mat3Equals(a: Mat3, b: Mat3, epsilon = 1e-6): boolean {
  for (let i = 0; i < 9; i++) {
    if (Math.abs(a[i] - b[i]) > epsilon) return false;
  }
  return true;
}

/**
 * Convert a Mat3 to a CSS transform string for DOM rendering.
 * CSS matrix() uses row-major order: matrix(a, b, c, d, tx, ty).
 */
export function mat3ToCssMatrix(m: Mat3): string {
  return `matrix(${m[0]}, ${m[1]}, ${m[3]}, ${m[4]}, ${m[6]}, ${m[7]})`;
}

/**
 * Compute the axis-aligned bounding box of a rectangle [0,0,w,h]
 * transformed by a world matrix. Used for dirty-rect checks and
 * broad-phase hit testing.
 */
export function mat3TransformAABB(
  m: Mat3,
  width: number,
  height: number,
): { minX: number; minY: number; maxX: number; maxY: number } {
  const p0 = mat3TransformPoint(m, { x: 0, y: 0 });
  const p1 = mat3TransformPoint(m, { x: width, y: 0 });
  const p2 = mat3TransformPoint(m, { x: width, y: height });
  const p3 = mat3TransformPoint(m, { x: 0, y: height });

  return {
    minX: Math.min(p0.x, p1.x, p2.x, p3.x),
    minY: Math.min(p0.y, p1.y, p2.y, p3.y),
    maxX: Math.max(p0.x, p1.x, p2.x, p3.x),
    maxY: Math.max(p0.y, p1.y, p2.y, p3.y),
  };
}
