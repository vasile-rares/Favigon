import { CanvasEffect, CanvasEffectPreset, CanvasEffectTrigger } from '@app/core';

type CanvasEffectMotion = Pick<
  CanvasEffect,
  'opacity' | 'scale' | 'rotate' | 'skewX' | 'skewY' | 'offsetX' | 'offsetY'
>;
type CanvasStateEffectDefaults = CanvasEffectMotion &
  Pick<CanvasEffect, 'duration' | 'delay' | 'easing' | 'fill' | 'shadow'>;
type CanvasLoopEffectDefaults = CanvasEffectMotion &
  Pick<
    CanvasEffect,
    'duration' | 'delay' | 'easing' | 'direction' | 'fillMode' | 'iterations' | 'offScreenBehavior'
  >;

const EFFECT_MOTION_DEFAULTS: Record<CanvasEffectPreset, CanvasEffectMotion> = {
  custom: { opacity: 0, scale: 1, rotate: 0, skewX: 0, skewY: 0, offsetX: 0, offsetY: 0 },
  fadeIn: { opacity: 0, scale: 1, rotate: 0, skewX: 0, skewY: 0, offsetX: 0, offsetY: 0 },
  scaleIn: { opacity: 0, scale: 0.9, rotate: 0, skewX: 0, skewY: 0, offsetX: 0, offsetY: 0 },
  scaleInBottom: {
    opacity: 0,
    scale: 0.88,
    rotate: 0,
    skewX: 0,
    skewY: 0,
    offsetX: 0,
    offsetY: 24,
  },
  flipHorizontal: {
    opacity: 0,
    scale: 0.94,
    rotate: 0,
    skewX: 0,
    skewY: -18,
    offsetX: 0,
    offsetY: 0,
  },
  flipVertical: { opacity: 0, scale: 0.94, rotate: 0, skewX: 18, skewY: 0, offsetX: 0, offsetY: 0 },
  slideInTop: { opacity: 0, scale: 1, rotate: 0, skewX: 0, skewY: 0, offsetX: 0, offsetY: -24 },
  fadeOut: { opacity: 0, scale: 1, rotate: 0, skewX: 0, skewY: 0, offsetX: 0, offsetY: 0 },
  slideInUp: { opacity: 0, scale: 1, rotate: 0, skewX: 0, skewY: 0, offsetX: 0, offsetY: 24 },
  slideInDown: { opacity: 0, scale: 1, rotate: 0, skewX: 0, skewY: 0, offsetX: 0, offsetY: -24 },
  slideInLeft: { opacity: 0, scale: 1, rotate: 0, skewX: 0, skewY: 0, offsetX: -24, offsetY: 0 },
  slideInRight: { opacity: 0, scale: 1, rotate: 0, skewX: 0, skewY: 0, offsetX: 24, offsetY: 0 },
  slideInBottom: { opacity: 0, scale: 1, rotate: 0, skewX: 0, skewY: 0, offsetX: 0, offsetY: 24 },
  scaleOut: { opacity: 0, scale: 1.08, rotate: 0, skewX: 0, skewY: 0, offsetX: 0, offsetY: 0 },
  spin: { opacity: 0, scale: 1, rotate: -180, skewX: 0, skewY: 0, offsetX: 0, offsetY: 0 },
  pulse: { opacity: 0, scale: 0.94, rotate: 0, skewX: 0, skewY: 0, offsetX: 0, offsetY: 0 },
  bounce: { opacity: 0, scale: 1, rotate: 0, skewX: 0, skewY: 0, offsetX: 0, offsetY: 24 },
  shake: { opacity: 0, scale: 1, rotate: 0, skewX: 0, skewY: 0, offsetX: 18, offsetY: 0 },
};

const STATE_TRIGGER_DEFAULTS: Record<'hover' | 'click', CanvasStateEffectDefaults> = {
  hover: {
    opacity: 1,
    scale: 1.02,
    rotate: 0,
    skewX: 0,
    skewY: 0,
    offsetX: 0,
    offsetY: -2,
    fill: undefined,
    shadow: undefined,
    duration: 180,
    delay: 0,
    easing: 'ease-out',
  },
  click: {
    opacity: 0.98,
    scale: 0.97,
    rotate: 0,
    skewX: 0,
    skewY: 0,
    offsetX: 0,
    offsetY: 1,
    fill: undefined,
    shadow: undefined,
    duration: 120,
    delay: 0,
    easing: 'ease-out',
  },
};

const LOOP_TRIGGER_DEFAULTS: CanvasLoopEffectDefaults = {
  opacity: 0.92,
  scale: 0.985,
  rotate: 0,
  skewX: 0,
  skewY: 0,
  offsetX: 0,
  offsetY: 0,
  duration: 1400,
  delay: 0,
  easing: 'linear',
  direction: 'alternate',
  fillMode: 'both',
  iterations: 'infinite',
  offScreenBehavior: 'play',
};

export function getCanvasEffectMotionDefaults(preset: CanvasEffectPreset): CanvasEffectMotion {
  return { ...EFFECT_MOTION_DEFAULTS[preset] };
}

export function createDefaultCanvasEffect(
  trigger: CanvasEffectTrigger = 'onLoad',
  preset: CanvasEffectPreset = 'fadeIn',
): CanvasEffect {
  const stateDefaults =
    trigger === 'hover' || trigger === 'click' ? STATE_TRIGGER_DEFAULTS[trigger] : null;
  const loopDefaults = trigger === 'loop' ? LOOP_TRIGGER_DEFAULTS : null;
  const resolvedPreset: CanvasEffectPreset = stateDefaults || loopDefaults ? 'custom' : preset;
  const motionDefaults =
    stateDefaults ?? loopDefaults ?? getCanvasEffectMotionDefaults(resolvedPreset);

  return {
    preset: resolvedPreset,
    trigger,
    opacity: motionDefaults.opacity,
    scale: motionDefaults.scale,
    rotate: motionDefaults.rotate,
    rotationMode: '2d',
    skewX: motionDefaults.skewX,
    skewY: motionDefaults.skewY,
    offsetX: motionDefaults.offsetX,
    offsetY: motionDefaults.offsetY,
    fill: stateDefaults?.fill,
    shadow: stateDefaults?.shadow,
    duration: stateDefaults?.duration ?? loopDefaults?.duration ?? 500,
    delay: stateDefaults?.delay ?? loopDefaults?.delay ?? 0,
    iterations: loopDefaults?.iterations ?? 1,
    easing: stateDefaults?.easing ?? loopDefaults?.easing ?? 'ease',
    direction: loopDefaults?.direction ?? 'normal',
    fillMode: loopDefaults?.fillMode ?? 'forwards',
    offScreenBehavior: loopDefaults?.offScreenBehavior ?? 'play',
  };
}

export function resolveCanvasEffect(
  effect: Partial<CanvasEffect> & Pick<CanvasEffect, 'preset'>,
): CanvasEffect {
  const defaults = createDefaultCanvasEffect(effect.trigger ?? 'onLoad', effect.preset);
  const resolvedPreset =
    effect.trigger === 'hover' || effect.trigger === 'click' || effect.trigger === 'loop'
      ? 'custom'
      : effect.preset;

  return {
    ...defaults,
    ...effect,
    preset: resolvedPreset,
    opacity: effect.opacity ?? defaults.opacity,
    scale: effect.scale ?? defaults.scale,
    rotate: effect.rotate ?? defaults.rotate,
    rotationMode: effect.rotationMode ?? defaults.rotationMode,
    skewX: effect.skewX ?? defaults.skewX,
    skewY: effect.skewY ?? defaults.skewY,
    offsetX: effect.offsetX ?? defaults.offsetX,
    offsetY: effect.offsetY ?? defaults.offsetY,
    easing: effect.easing ?? defaults.easing,
    direction: effect.direction ?? defaults.direction,
    fillMode: effect.fillMode ?? defaults.fillMode,
    iterations: effect.iterations ?? defaults.iterations,
    offScreenBehavior: effect.offScreenBehavior ?? defaults.offScreenBehavior,
    fill: effect.fill?.trim() ? effect.fill.trim() : undefined,
    shadow: effect.shadow?.trim() ? effect.shadow.trim() : undefined,
  };
}
