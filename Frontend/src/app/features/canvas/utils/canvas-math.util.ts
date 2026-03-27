export function roundToTwoDecimals(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function clamp(value: number, min: number, max: number): number {
  return roundToTwoDecimals(Math.min(Math.max(value, min), max));
}
