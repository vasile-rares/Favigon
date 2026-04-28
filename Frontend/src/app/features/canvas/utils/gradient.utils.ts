import type {
  ConicGradientFill,
  GradientFill,
  GradientStop,
  LinearGradientFill,
  RadialGradientFill,
} from '@app/core';

export function gradientToCss(gradient: GradientFill): string {
  const stops = gradient.stops
    .slice()
    .sort((a, b) => a.position - b.position)
    .map((s) => `${s.color} ${s.position}%`)
    .join(', ');

  switch (gradient.type) {
    case 'linear':
      return `linear-gradient(${(gradient as LinearGradientFill).angle}deg, ${stops})`;
    case 'radial':
      return `radial-gradient(circle, ${stops})`;
    case 'conic':
      return `conic-gradient(from ${(gradient as ConicGradientFill).angle}deg, ${stops})`;
  }
}

export function defaultLinearGradient(baseColor: string): LinearGradientFill {
  return {
    type: 'linear',
    angle: 90,
    stops: [
      { color: baseColor, position: 0 },
      { color: '#000000', position: 100 },
    ],
  };
}

export function defaultRadialGradient(baseColor: string): RadialGradientFill {
  return {
    type: 'radial',
    stops: [
      { color: baseColor, position: 0 },
      { color: '#000000', position: 100 },
    ],
  };
}

export function defaultConicGradient(baseColor: string): ConicGradientFill {
  return {
    type: 'conic',
    angle: 0,
    stops: [
      { color: baseColor, position: 0 },
      { color: '#000000', position: 100 },
    ],
  };
}

export function interpolateGradientColor(gradient: GradientFill, position: number): string {
  const sorted = [...gradient.stops].sort((a, b) => a.position - b.position);
  if (sorted.length === 0) return '#000000';
  if (position <= sorted[0].position) return sorted[0].color;
  if (position >= sorted[sorted.length - 1].position) return sorted[sorted.length - 1].color;
  for (let i = 0; i < sorted.length - 1; i++) {
    if (position >= sorted[i].position && position <= sorted[i + 1].position) {
      return sorted[i].color;
    }
  }
  return sorted[0].color;
}

export function clampPosition(position: number): number {
  return Math.max(0, Math.min(100, Math.round(position)));
}

export function buildGradient(
  type: GradientFill['type'],
  stops: GradientStop[],
  angle: number,
): GradientFill {
  switch (type) {
    case 'linear':
      return { type: 'linear', angle, stops };
    case 'radial':
      return { type: 'radial', stops };
    case 'conic':
      return { type: 'conic', angle, stops };
  }
}
