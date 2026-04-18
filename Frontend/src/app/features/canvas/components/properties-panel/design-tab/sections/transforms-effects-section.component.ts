import { Component, input, output, ViewEncapsulation } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DropdownSelectComponent, ToggleGroupComponent, ContextMenuComponent } from '@app/shared';
import { NumberInputComponent } from '../../number-input/number-input.component';
import { FieldInputComponent } from '../../field-input/field-input.component';
import type { DropdownSelectOption, ToggleGroupOption, ContextMenuItem } from '@app/shared';
import {
  CanvasBackfaceVisibility,
  CanvasEffect,
  CanvasEffectEasing,
  CanvasEffectOffScreenBehavior,
  CanvasEffectPreset,
  CanvasEffectTrigger,
  CanvasElement,
  CanvasElementType,
  CanvasRotationMode,
  CanvasTransformOption,
} from '@app/core';

import { roundToTwoDecimals } from '../../../../utils/canvas-math.util';
import {
  getCanvasShadowCss,
  hasCanvasShadow,
  normalizeCanvasShadowValue,
  resolveEditableCanvasShadow,
} from '../../../../utils/element/canvas-shadow.util';
import {
  createDefaultCanvasEffect,
  resolveCanvasEffect,
} from '../../../../utils/element/canvas-effect.util';

type EffectPopupView = 'main' | 'transition' | 'fill' | 'shadow';

interface TransformOptionDefinition {
  id: CanvasTransformOption;
  label: string;
}

const TRANSFORM_OPTION_DEFINITIONS: readonly TransformOptionDefinition[] = [
  { id: 'scale', label: 'Scale' },
  { id: 'rotate', label: 'Rotate' },
  { id: 'skew', label: 'Skew' },
  { id: 'depth', label: 'Depth' },
  { id: 'perspective', label: 'Perspective' },
  { id: 'origin', label: 'Origin' },
  { id: 'backface', label: 'Backface' },
  { id: 'preserve3d', label: 'Preserve 3D' },
] as const;

const TRANSFORM_DEPTH_MIN = -1000;
const TRANSFORM_DEPTH_MAX = 1000;
const TRANSFORM_PERSPECTIVE_MIN = 100;
const TRANSFORM_PERSPECTIVE_MAX = 3000;
const EFFECT_PREVIEW_BACKGROUND =
  'linear-gradient(180deg, rgba(255, 255, 255, 0.2), rgba(255, 255, 255, 0.08)), linear-gradient(135deg, rgba(86, 162, 255, 0.88), rgba(33, 91, 201, 0.92))';
const EFFECT_PREVIEW_SHADOW =
  '0 18px 30px rgba(0, 0, 0, 0.28), inset 0 1px 0 rgba(255, 255, 255, 0.28)';
const EFFECT_PREVIEW_HOVER_IDLE_MS = 1180;
const EFFECT_PREVIEW_CLICK_IDLE_MS = 1080;

@Component({
  selector: 'app-dt-transforms-effects-section',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    DropdownSelectComponent,
    ToggleGroupComponent,
    NumberInputComponent,
    FieldInputComponent,
    ContextMenuComponent,
  ],
  templateUrl: './transforms-effects-section.component.html',
  encapsulation: ViewEncapsulation.None,
})
export class TransformsEffectsSectionComponent {
  readonly element = input.required<CanvasElement>();
  readonly projectId = input<number | null>(null);

  readonly elementPatch = output<Partial<CanvasElement>>();
  readonly numberInputGestureStarted = output<void>();
  readonly numberInputGestureCommitted = output<void>();

  private readonly effectPopupViews = new Map<number, EffectPopupView>();
  private readonly effectPreviewVersions = new Map<number, number>();

  transformMenuItems: ContextMenuItem[] = [];
  transformMenuX = 0;
  transformMenuY = 0;
  effectMenuItems: ContextMenuItem[] = [];
  effectMenuX = 0;
  effectMenuY = 0;

  readonly transformOptionDefinitions = TRANSFORM_OPTION_DEFINITIONS;
  readonly rotateModeOptions: readonly ToggleGroupOption[] = [
    { label: '2D', value: '2d' },
    { label: '3D', value: '3d' },
  ];
  readonly backfaceVisibilityOptions: readonly ToggleGroupOption[] = [
    { label: 'Visible', value: 'visible' },
    { label: 'Hidden', value: 'hidden' },
  ];
  readonly preserve3DOptions: readonly ToggleGroupOption[] = [
    { label: 'Yes', value: true },
    { label: 'No', value: false },
  ];
  readonly effectPresetOptions: DropdownSelectOption[] = [
    { label: 'Custom', value: 'custom' },
    { label: 'Fade In', value: 'fadeIn' },
    { label: 'Scale In', value: 'scaleIn' },
    { label: 'Scale In Bottom', value: 'scaleInBottom' },
    { label: 'Flip Horizontal', value: 'flipHorizontal' },
    { label: 'Flip Vertical', value: 'flipVertical' },
    { label: 'Slide In Top', value: 'slideInTop' },
    { label: 'Slide In Left', value: 'slideInLeft' },
    { label: 'Slide In Right', value: 'slideInRight' },
    { label: 'Slide In Bottom', value: 'slideInBottom' },
  ];
  readonly effectTriggerOptions: DropdownSelectOption[] = [
    { label: 'On Load', value: 'onLoad' },
    { label: 'Hover', value: 'hover' },
    { label: 'Click / Tap', value: 'click' },
    { label: 'Loop', value: 'loop' },
  ];
  readonly effectEasingOptions: DropdownSelectOption[] = [
    { label: 'Ease', value: 'ease' },
    { label: 'Ease In', value: 'ease-in' },
    { label: 'Ease Out', value: 'ease-out' },
    { label: 'Ease In Out', value: 'ease-in-out' },
    { label: 'Linear', value: 'linear' },
  ];
  readonly effectLoopTypeOptions: readonly ToggleGroupOption[] = [
    { label: 'Loop', value: 'loop' },
    { label: 'Mirror', value: 'mirror' },
  ];
  readonly effectOffScreenOptions: readonly ToggleGroupOption[] = [
    { label: 'Play', value: 'play' },
    { label: 'Pause', value: 'pause' },
  ];

  private readonly defaultFillColor = '#e0e0e0';
  private readonly defaultFrameFillColor = '#3f3f46';

  onNumberInputGestureStarted(): void {
    this.numberInputGestureStarted.emit();
  }

  onNumberInputGestureCommitted(): void {
    this.numberInputGestureCommitted.emit();
  }

  // --- Transform section ---

  hasTransforms(element: CanvasElement): boolean {
    return this.activeTransformOptions(element).length > 0;
  }

  isTransformOptionAdded(element: CanvasElement, option: CanvasTransformOption): boolean {
    return this.activeTransformOptions(element).includes(option);
  }

  onTransformSectionHeaderClick(event: MouseEvent): void {
    this.openTransformMenu(event, this.resolveSectionHeaderTrigger(event));
  }

  onTransformSectionToggleClick(event: MouseEvent): void {
    event.stopPropagation();
    this.onTransformSectionHeaderClick(event);
  }

  transformScaleValue(element: CanvasElement): number {
    const scaleX = Math.abs(element.scaleX ?? 1);
    const scaleY = Math.abs(element.scaleY ?? 1);
    return roundToTwoDecimals(Math.max(scaleX, scaleY));
  }

  rotationValue(element: CanvasElement): number {
    return element.rotation ?? 0;
  }

  rotationModeValue(element: CanvasElement): CanvasRotationMode {
    return element.rotationMode === '3d' ? '3d' : '2d';
  }

  skewXValue(element: CanvasElement): number {
    return element.skewX ?? 0;
  }

  skewYValue(element: CanvasElement): number {
    return element.skewY ?? 0;
  }

  depthValue(element: CanvasElement): number {
    return element.depth ?? 0;
  }

  perspectiveValue(element: CanvasElement): number {
    return element.perspective ?? 1200;
  }

  originXValue(element: CanvasElement): number {
    return element.transformOriginX ?? 50;
  }

  originYValue(element: CanvasElement): number {
    return element.transformOriginY ?? 50;
  }

  backfaceVisibilityValue(element: CanvasElement): CanvasBackfaceVisibility {
    return element.backfaceVisibility === 'hidden' ? 'hidden' : 'visible';
  }

  preserve3DValue(element: CanvasElement): boolean {
    return element.preserve3D ?? true;
  }

  transformSliderPercent(value: number, min: number, max: number): string {
    const clamped = Math.max(min, Math.min(max, value));
    const ratio = (clamped - min) / Math.max(max - min, 1);
    return `${Math.round(ratio * 100)}%`;
  }

  onTransformScaleChange(value: number): void {
    if (!Number.isFinite(value)) return;
    const element = this.element();
    const magnitude = Math.max(0.1, roundToTwoDecimals(Math.abs(value)));
    const scaleXSign = (element.scaleX ?? 1) < 0 ? -1 : 1;
    const scaleYSign = (element.scaleY ?? 1) < 0 ? -1 : 1;
    this.elementPatch.emit({
      transformOptions: this.mergeTransformOptions(element, 'scale'),
      scaleX: roundToTwoDecimals(scaleXSign * magnitude),
      scaleY: roundToTwoDecimals(scaleYSign * magnitude),
    });
  }

  onRotationChange(value: number): void {
    if (!Number.isFinite(value)) return;
    const element = this.element();
    this.elementPatch.emit({
      transformOptions: this.mergeTransformOptions(element, 'rotate'),
      rotation: roundToTwoDecimals(value),
    });
  }

  onRotationModeChange(value: string | number | boolean | null): void {
    if (value !== '2d' && value !== '3d') return;
    const element = this.element();
    this.elementPatch.emit({
      transformOptions: this.mergeTransformOptions(element, 'rotate'),
      rotationMode: value,
    });
  }

  onSkewChange(axis: 'x' | 'y', value: number): void {
    if (!Number.isFinite(value)) return;
    const element = this.element();
    this.elementPatch.emit({
      transformOptions: this.mergeTransformOptions(element, 'skew'),
      skewX: axis === 'x' ? roundToTwoDecimals(value) : this.skewXValue(element),
      skewY: axis === 'y' ? roundToTwoDecimals(value) : this.skewYValue(element),
    });
  }

  onDepthChange(value: number): void {
    if (!Number.isFinite(value)) return;
    const element = this.element();
    this.elementPatch.emit({
      transformOptions: this.mergeTransformOptions(element, 'depth'),
      depth: Math.max(
        TRANSFORM_DEPTH_MIN,
        Math.min(TRANSFORM_DEPTH_MAX, roundToTwoDecimals(value)),
      ),
    });
  }

  onPerspectiveChange(value: number): void {
    if (!Number.isFinite(value)) return;
    const element = this.element();
    this.elementPatch.emit({
      transformOptions: this.mergeTransformOptions(element, 'perspective'),
      perspective: Math.max(
        TRANSFORM_PERSPECTIVE_MIN,
        Math.min(TRANSFORM_PERSPECTIVE_MAX, roundToTwoDecimals(value)),
      ),
    });
  }

  onOriginChange(axis: 'x' | 'y', value: number): void {
    if (!Number.isFinite(value)) return;
    const element = this.element();
    const normalized = Math.max(0, Math.min(100, roundToTwoDecimals(value)));
    this.elementPatch.emit({
      transformOptions: this.mergeTransformOptions(element, 'origin'),
      transformOriginX: axis === 'x' ? normalized : this.originXValue(element),
      transformOriginY: axis === 'y' ? normalized : this.originYValue(element),
    });
  }

  onBackfaceVisibilityChange(value: string | number | boolean | null): void {
    if (value !== 'visible' && value !== 'hidden') return;
    const element = this.element();
    this.elementPatch.emit({
      transformOptions: this.mergeTransformOptions(element, 'backface'),
      backfaceVisibility: value,
    });
  }

  onPreserve3DChange(value: string | number | boolean | null): void {
    if (typeof value !== 'boolean') return;
    const element = this.element();
    this.elementPatch.emit({
      transformOptions: this.mergeTransformOptions(element, 'preserve3d'),
      preserve3D: value,
    });
  }

  closeTransformMenu(): void {
    this.transformMenuItems = [];
  }

  // --- Effects section ---

  getEffects(element: CanvasElement): CanvasEffect[] {
    return element.effects ?? [];
  }

  trackEffectByIndex(index: number): number {
    return index;
  }

  hasEffects(element: CanvasElement): boolean {
    return (element.effects?.length ?? 0) > 0;
  }

  onEffectSectionHeaderClick(event: MouseEvent): void {
    this.openEffectMenu(event, this.resolveSectionHeaderTrigger(event));
  }

  onEffectSectionToggleClick(event: MouseEvent): void {
    event.stopPropagation();
    this.onEffectSectionHeaderClick(event);
  }

  addEffect(trigger: CanvasEffectTrigger = createDefaultCanvasEffect().trigger): void {
    const current = this.element().effects ?? [];
    this.elementPatch.emit({ effects: [...current, createDefaultCanvasEffect(trigger)] });
  }

  removeEffect(index: number): void {
    const current = this.element().effects;
    if (!current) return;
    const updated = current.filter((_, i) => i !== index);
    this.effectPopupViews.clear();
    this.effectPreviewVersions.clear();
    this.elementPatch.emit({ effects: updated.length > 0 ? updated : undefined });
  }

  effectDisplayName(effect: CanvasEffect, index: number): string {
    const fallback = `Effect ${index + 1}`;
    if (effect.trigger === 'focus') return 'Focus';
    return this.lookupEffectOptionLabel(this.effectTriggerOptions, effect.trigger) ?? fallback;
  }

  effectPopupTitle(effect: CanvasEffect, index: number): string {
    return this.effectDisplayName(effect, index);
  }

  effectUsesHoverEditor(effect: CanvasEffect): boolean {
    const trigger = resolveCanvasEffect(effect).trigger;
    return trigger === 'hover' || trigger === 'click';
  }

  effectUsesLoopEditor(effect: CanvasEffect): boolean {
    return resolveCanvasEffect(effect).trigger === 'loop';
  }

  effectSupportsTransition(effect: CanvasEffect): boolean {
    return (
      this.effectUsesHoverEditor(effect) ||
      this.effectUsesLoopEditor(effect) ||
      effect.preset === 'custom'
    );
  }

  effectPopupView(index: number): EffectPopupView {
    return this.effectPopupViews.get(index) ?? 'main';
  }

  effectTransitionSummary(effect: CanvasEffect): string {
    const resolved = resolveCanvasEffect(effect);
    const duration = Math.max(0, Math.round(resolved.duration));
    const delay = Math.max(0, Math.round(resolved.delay));
    const easing =
      this.lookupEffectOptionLabel(this.effectEasingOptions, resolved.easing) ?? 'Ease';
    if (this.effectUsesLoopEditor(resolved)) return `${duration}ms, ${easing}`;
    return delay > 0 ? `${duration}ms, ${easing}, +${delay}ms` : `${duration}ms, ${easing}`;
  }

  effectPreviewStyle(effect: CanvasEffect, index: number): Record<string, string> {
    const resolved = resolveCanvasEffect(effect);
    const usesHoverEditor = this.effectUsesHoverEditor(resolved);
    const usesLoopEditor = this.effectUsesLoopEditor(resolved);
    const usesClickPreview = resolved.trigger === 'click';
    const usesHoverPreview = resolved.trigger === 'hover';
    const loopDelay = usesLoopEditor ? Math.max(0, Math.round(resolved.delay)) : 0;
    const isMirrorLoop = usesLoopEditor && this.effectLoopTypeValue(resolved) === 'mirror';
    const previewDuration = usesLoopEditor
      ? Math.max(320, Math.round(resolved.duration) + loopDelay) * (isMirrorLoop ? 2 : 1)
      : usesHoverPreview
        ? Math.max(180, Math.round(resolved.duration)) * 2 + EFFECT_PREVIEW_HOVER_IDLE_MS
        : Math.max(240, Math.round(resolved.duration)) +
          (usesClickPreview ? EFFECT_PREVIEW_CLICK_IDLE_MS : EFFECT_PREVIEW_HOVER_IDLE_MS);
    const versionOffset = ((this.effectPreviewVersions.get(index) ?? 0) & 1) * 0.001;
    const animationName = usesLoopEditor
      ? this.effectLoopPreviewAnimationName(resolved)
      : usesHoverPreview
        ? 'pp-effect-preview-hover'
        : usesClickPreview
          ? 'pp-effect-preview-press'
          : 'pp-effect-preview-enter';
    const animationFillMode = usesLoopEditor ? resolved.fillMode : 'both';

    return {
      '--pp-effect-preview-from-opacity': this.formatEffectPreviewNumber(
        usesHoverEditor ? 1 : Math.max(0, Math.min(1, resolved.opacity)),
      ),
      '--pp-effect-preview-to-opacity': this.formatEffectPreviewNumber(
        usesHoverEditor ? Math.max(0, Math.min(1, resolved.opacity)) : 1,
      ),
      '--pp-effect-preview-from-transform': this.buildEffectPreviewTransform(
        resolved,
        usesHoverEditor,
      ),
      '--pp-effect-preview-to-transform': this.buildEffectPreviewTransform(
        resolved,
        !usesHoverEditor,
      ),
      '--pp-effect-preview-from-background': usesHoverEditor
        ? EFFECT_PREVIEW_BACKGROUND
        : this.composeEffectPreviewBackground(resolved.fill),
      '--pp-effect-preview-to-background': usesHoverEditor
        ? this.composeEffectPreviewBackground(resolved.fill)
        : EFFECT_PREVIEW_BACKGROUND,
      '--pp-effect-preview-from-box-shadow': usesHoverEditor
        ? EFFECT_PREVIEW_SHADOW
        : this.composeEffectPreviewShadow(resolved.shadow),
      '--pp-effect-preview-to-box-shadow': usesHoverEditor
        ? this.composeEffectPreviewShadow(resolved.shadow)
        : EFFECT_PREVIEW_SHADOW,
      animation: `${animationName} ${previewDuration + versionOffset}ms ${resolved.easing} 0ms infinite normal ${animationFillMode}`,
    };
  }

  effectLoopPreviewAnimationName(effect: CanvasEffect): string {
    const resolved = resolveCanvasEffect(effect);
    const hasPause = resolved.delay > 0;
    const isMirror = this.effectLoopTypeValue(resolved) === 'mirror';
    if (isMirror)
      return hasPause ? 'pp-effect-preview-mirror' : 'pp-effect-preview-mirror-seamless';
    return hasPause ? 'pp-effect-preview-loop' : 'pp-effect-preview-loop-seamless';
  }

  effectLoopTypeValue(effect: CanvasEffect): 'loop' | 'mirror' {
    const direction = resolveCanvasEffect(effect).direction;
    return direction === 'alternate' || direction === 'alternate-reverse' ? 'mirror' : 'loop';
  }

  effectOffScreenBehaviorValue(effect: CanvasEffect): CanvasEffectOffScreenBehavior {
    return resolveCanvasEffect(effect).offScreenBehavior;
  }

  effectHasActiveFill(effect: CanvasEffect): boolean {
    return typeof effect.fill === 'string' && effect.fill.trim().length > 0;
  }

  effectFillLabel(effect: CanvasEffect): string {
    const fill = effect.fill?.trim();
    if (!fill) return 'None';
    return fill.toLowerCase() === 'transparent' ? 'Transparent' : preserveColorDisplayValue(fill);
  }

  effectIsTransparentFill(effect: CanvasEffect): boolean {
    const fill = effect.fill?.trim();
    return !fill || isTransparentColor(fill);
  }

  effectFillSwatchBackground(effect: CanvasEffect): string | null {
    const fill = effect.fill?.trim();
    return !fill || isTransparentColor(fill) ? null : fill;
  }

  effectFillInputValue(effect: CanvasEffect): string {
    const fill = effect.fill?.trim();
    if (fill) return fill;
    const element = this.element();
    return this.hasFill(element.type) ? this.fillInputValue(element) : this.defaultFillColor;
  }

  effectFillPickerValue(effect: CanvasEffect): string {
    const fillValue = this.effectFillInputValue(effect);
    if (fillValue !== 'transparent') return fillValue;
    const element = this.element();
    return this.hasFill(element.type) ? this.fillPickerValue(element) : this.defaultFillColor;
  }

  effectHasActiveShadow(effect: CanvasEffect): boolean {
    return hasCanvasShadow(effect.shadow);
  }

  effectShadowSummary(effect: CanvasEffect): string {
    if (!hasCanvasShadow(effect.shadow)) return 'None';
    const shadow = resolveEditableCanvasShadow(effect.shadow);
    return `${this.formatShadowMetric(shadow.x)}, ${this.formatShadowMetric(shadow.y)}, ${this.formatShadowMetric(shadow.spread)}`;
  }

  effectShadowSwatchBackground(effect: CanvasEffect): string | null {
    return this.effectHasActiveShadow(effect)
      ? resolveEditableCanvasShadow(effect.shadow).color
      : null;
  }

  effectShadowEditorValue(effect: CanvasEffect): string | null {
    return (
      normalizeCanvasShadowValue(effect.shadow) ??
      normalizeCanvasShadowValue(this.element().shadow) ??
      null
    );
  }

  openEffectTransitionSettings(index: number): void {
    this.openEffectPopupSubview(index, 'transition');
  }

  openEffectFillSettings(index: number): void {
    this.openEffectPopupSubview(index, 'fill');
  }

  openEffectShadowSettings(index: number): void {
    this.openEffectPopupSubview(index, 'shadow');
  }

  closeEffectPopupSubview(index: number): void {
    this.effectPopupViews.set(index, 'main');
  }

  onEffectPopupOpenChange(index: number, isOpen: boolean): void {
    if (isOpen) {
      this.effectPopupViews.set(index, 'main');
      return;
    }
    this.effectPopupViews.delete(index);
  }

  effectShowsCustomControls(effect: CanvasEffect): boolean {
    return effect.preset === 'custom';
  }

  effectOpacityValue(effect: CanvasEffect): number {
    return resolveCanvasEffect(effect).opacity;
  }

  effectOpacitySliderPercent(effect: CanvasEffect): string {
    return this.transformSliderPercent(this.effectOpacityValue(effect), 0, 1);
  }

  effectScaleValue(effect: CanvasEffect): number {
    return resolveCanvasEffect(effect).scale;
  }

  effectRotateValue(effect: CanvasEffect): number {
    return resolveCanvasEffect(effect).rotate;
  }

  effectRotationModeValue(effect: CanvasEffect): CanvasRotationMode {
    return resolveCanvasEffect(effect).rotationMode;
  }

  effectSkewXValue(effect: CanvasEffect): number {
    return resolveCanvasEffect(effect).skewX;
  }

  effectSkewYValue(effect: CanvasEffect): number {
    return resolveCanvasEffect(effect).skewY;
  }

  effectOffsetXValue(effect: CanvasEffect): number {
    return resolveCanvasEffect(effect).offsetX;
  }

  effectOffsetYValue(effect: CanvasEffect): number {
    return resolveCanvasEffect(effect).offsetY;
  }

  onEffectPresetChange(index: number, value: string | number | boolean | null): void {
    if (typeof value !== 'string') return;
    const current = this.element().effects?.[index];
    if (!current) return;
    this.closeEffectPopupSubview(index);
    const resolved = resolveCanvasEffect(current);
    if (value === 'custom') {
      this.patchEffectAt(index, { preset: 'custom' });
      return;
    }
    const presetEffect = createDefaultCanvasEffect(resolved.trigger, value as CanvasEffectPreset);
    this.patchEffectAt(index, {
      preset: presetEffect.preset,
      opacity: presetEffect.opacity,
      scale: presetEffect.scale,
      rotate: presetEffect.rotate,
      skewX: presetEffect.skewX,
      skewY: presetEffect.skewY,
      offsetX: presetEffect.offsetX,
      offsetY: presetEffect.offsetY,
    });
  }

  onEffectTriggerChange(index: number, value: string | number | boolean | null): void {
    if (typeof value !== 'string') return;
    if (value === 'hover' || value === 'click' || value === 'loop') {
      const nextEffect = createDefaultCanvasEffect(value as CanvasEffectTrigger);
      this.patchEffectAt(index, {
        trigger: nextEffect.trigger,
        preset: nextEffect.preset,
        opacity: nextEffect.opacity,
        scale: nextEffect.scale,
        rotate: nextEffect.rotate,
        rotationMode: nextEffect.rotationMode,
        skewX: nextEffect.skewX,
        skewY: nextEffect.skewY,
        offsetX: nextEffect.offsetX,
        offsetY: nextEffect.offsetY,
        fill: undefined,
        shadow: undefined,
        duration: nextEffect.duration,
        delay: nextEffect.delay,
        iterations: nextEffect.iterations,
        easing: nextEffect.easing,
        direction: nextEffect.direction,
        fillMode: nextEffect.fillMode,
        offScreenBehavior: nextEffect.offScreenBehavior,
      });
      this.closeEffectPopupSubview(index);
      return;
    }
    this.patchEffectAt(index, { trigger: value as CanvasEffectTrigger });
  }

  onEffectOpacityChange(index: number, value: number): void {
    this.patchEffectAt(index, { opacity: Math.max(0, Math.min(1, value)) });
  }

  onEffectScaleChange(index: number, value: number): void {
    this.patchEffectAt(index, { scale: Math.max(0, value) });
  }

  onEffectRotateChange(index: number, value: number): void {
    this.patchEffectAt(index, { rotate: value });
  }

  onEffectRotationModeChange(index: number, value: string | number | boolean | null): void {
    if (value !== '2d' && value !== '3d') return;
    this.patchEffectAt(index, { rotationMode: value });
  }

  onEffectSkewChange(index: number, axis: 'x' | 'y', value: number): void {
    this.patchEffectAt(index, axis === 'x' ? { skewX: value } : { skewY: value });
  }

  onEffectOffsetChange(index: number, axis: 'x' | 'y', value: number): void {
    this.patchEffectAt(index, axis === 'x' ? { offsetX: value } : { offsetY: value });
  }

  onEffectDurationChange(index: number, value: number): void {
    this.patchEffectAt(index, { duration: value });
  }

  onEffectDelayChange(index: number, value: number): void {
    this.patchEffectAt(index, { delay: value });
  }

  onEffectLoopTypeChange(index: number, value: string | number | boolean | null): void {
    if (value !== 'loop' && value !== 'mirror') return;
    this.patchEffectAt(index, { direction: value === 'mirror' ? 'alternate' : 'normal' });
  }

  onEffectOffScreenBehaviorChange(index: number, value: string | number | boolean | null): void {
    if (value !== 'play' && value !== 'pause') return;
    this.patchEffectAt(index, { offScreenBehavior: value });
  }

  onEffectEasingChange(index: number, value: string | number | boolean | null): void {
    if (typeof value !== 'string') return;
    this.patchEffectAt(index, { easing: value as CanvasEffectEasing });
  }

  onEffectFillPatch(index: number, patch: Partial<CanvasElement>): void {
    if (!Object.prototype.hasOwnProperty.call(patch, 'fill')) return;
    this.patchEffectAt(index, { fill: typeof patch.fill === 'string' ? patch.fill : undefined });
  }

  clearEffectFill(index: number): void {
    this.patchEffectAt(index, { fill: undefined });
  }

  onEffectShadowPatch(index: number, patch: Partial<CanvasElement>): void {
    if (!Object.prototype.hasOwnProperty.call(patch, 'shadow')) return;
    this.patchEffectAt(index, { shadow: normalizeCanvasShadowValue(patch.shadow) });
  }

  clearEffectShadow(index: number): void {
    this.patchEffectAt(index, { shadow: undefined });
  }

  closeEffectMenu(): void {
    this.effectMenuItems = [];
  }

  hasFill(type: CanvasElementType): boolean {
    return type !== 'text' && type !== 'image';
  }

  supportsShadow(type: CanvasElementType): boolean {
    return type !== 'text';
  }

  private fillInputValue(element: CanvasElement): string {
    const fallback = element.type === 'frame' ? this.defaultFrameFillColor : this.defaultFillColor;
    return this.toHexColorOrFallback(element.fill, fallback);
  }

  private fillPickerValue(element: CanvasElement): string {
    const fillValue = this.fillInputValue(element);
    if (fillValue !== 'transparent') return fillValue;
    return element.type === 'frame' ? this.defaultFrameFillColor : this.defaultFillColor;
  }

  private patchEffectAt(index: number, patch: Partial<CanvasEffect>): void {
    const effects = this.element().effects;
    if (!effects) return;
    this.bumpEffectPreviewVersion(index);
    this.elementPatch.emit({
      effects: effects.map((e, i) => (i === index ? { ...resolveCanvasEffect(e), ...patch } : e)),
    });
  }

  private openEffectPopupSubview(index: number, view: Exclude<EffectPopupView, 'main'>): void {
    const current = this.element().effects?.[index];
    if (!current) return;
    if (view === 'transition' && !this.effectSupportsTransition(current)) return;
    if ((view === 'fill' || view === 'shadow') && !this.effectUsesHoverEditor(current)) return;
    this.effectPopupViews.set(index, view);
  }

  private bumpEffectPreviewVersion(index: number): void {
    this.effectPreviewVersions.set(index, (this.effectPreviewVersions.get(index) ?? 0) + 1);
  }

  private openTransformMenu(event: MouseEvent | null, trigger: HTMLElement | null): void {
    const element = this.element();
    const position = this.resolveMenuPosition(event, trigger);
    if (!position) return;
    this.closeEffectMenu();
    if (this.transformMenuItems.length > 0) return;
    this.transformMenuItems = this.buildTransformMenuItems(element);
    this.transformMenuX = position.x;
    this.transformMenuY = position.y;
  }

  private openEffectMenu(event: MouseEvent | null, trigger: HTMLElement | null): void {
    const position = this.resolveMenuPosition(event, trigger);
    if (!position) return;
    this.closeTransformMenu();
    if (this.effectMenuItems.length > 0) return;
    this.effectMenuItems = this.buildEffectMenuItems();
    this.effectMenuX = position.x;
    this.effectMenuY = position.y;
  }

  private resolveMenuPosition(
    event: MouseEvent | null,
    trigger: HTMLElement | null,
  ): { x: number; y: number } | null {
    if (event && Number.isFinite(event.clientX) && Number.isFinite(event.clientY)) {
      return { x: event.clientX, y: event.clientY };
    }
    if (!trigger) return null;
    const rect = trigger.getBoundingClientRect();
    return { x: rect.left, y: rect.top - 6 };
  }

  private resolveSectionHeaderTrigger(event: MouseEvent): HTMLElement | null {
    const currentTarget = event.currentTarget;
    if (!(currentTarget instanceof HTMLElement)) return null;
    return (
      (currentTarget.closest('.properties-section-header') as HTMLElement | null) ??
      (currentTarget.querySelector('.properties-section-header') as HTMLElement | null)
    );
  }

  private buildTransformMenuItems(element: CanvasElement): ContextMenuItem[] {
    return this.transformOptionDefinitions.map((option) => ({
      id: option.id,
      label: option.label,
      checked: this.isTransformOptionAdded(element, option.id),
      showCheckSlot: true,
      action: () => this.toggleTransformOption(option.id),
    }));
  }

  private buildEffectMenuItems(): ContextMenuItem[] {
    return this.effectTriggerOptions.map((option) => ({
      id: String(option.value),
      label: option.label,
      action: () => {
        this.addEffect(option.value as CanvasEffectTrigger);
        this.closeEffectMenu();
      },
    }));
  }

  private toggleTransformOption(option: CanvasTransformOption): void {
    const element = this.element();
    const patch = this.isTransformOptionAdded(element, option)
      ? this.buildRemoveTransformOptionPatch(element, option)
      : this.buildTransformOptionPatch(element, option);
    this.elementPatch.emit(patch);
    this.closeTransformMenu();
  }

  private activeTransformOptions(element: CanvasElement): CanvasTransformOption[] {
    const explicitOptions = Array.isArray(element.transformOptions) ? element.transformOptions : [];
    const active = new Set<CanvasTransformOption>(explicitOptions);
    if ((element.scaleX ?? 1) !== 1 || (element.scaleY ?? 1) !== 1) active.add('scale');
    if ((element.rotation ?? 0) !== 0 || element.rotationMode === '3d') active.add('rotate');
    if ((element.skewX ?? 0) !== 0 || (element.skewY ?? 0) !== 0) active.add('skew');
    if ((element.depth ?? 0) !== 0) active.add('depth');
    if (element.perspective !== undefined) active.add('perspective');
    if (element.transformOriginX !== undefined || element.transformOriginY !== undefined)
      active.add('origin');
    if (element.backfaceVisibility !== undefined) active.add('backface');
    if (element.preserve3D !== undefined) active.add('preserve3d');
    return this.transformOptionDefinitions.map((o) => o.id).filter((o) => active.has(o));
  }

  private mergeTransformOptions(
    element: CanvasElement,
    ...options: CanvasTransformOption[]
  ): CanvasTransformOption[] {
    const next = new Set<CanvasTransformOption>(this.activeTransformOptions(element));
    for (const option of options) next.add(option);
    return this.transformOptionDefinitions.map((o) => o.id).filter((o) => next.has(o));
  }

  private removeTransformOptions(
    element: CanvasElement,
    ...options: CanvasTransformOption[]
  ): CanvasTransformOption[] | undefined {
    const removed = new Set<CanvasTransformOption>(options);
    const next = this.activeTransformOptions(element).filter((o) => !removed.has(o));
    return next.length > 0 ? next : undefined;
  }

  private buildTransformOptionPatch(
    element: CanvasElement,
    option: CanvasTransformOption,
  ): Partial<CanvasElement> {
    const transformOptions = this.mergeTransformOptions(element, option);
    switch (option) {
      case 'scale':
        return { transformOptions, scaleX: element.scaleX ?? 1, scaleY: element.scaleY ?? 1 };
      case 'rotate':
        return {
          transformOptions,
          rotation: element.rotation ?? 0,
          rotationMode: this.rotationModeValue(element),
        };
      case 'skew':
        return { transformOptions, skewX: element.skewX ?? 0, skewY: element.skewY ?? 0 };
      case 'depth':
        return { transformOptions, depth: element.depth ?? 0 };
      case 'perspective':
        return { transformOptions, perspective: element.perspective ?? 1200 };
      case 'origin':
        return {
          transformOptions,
          transformOriginX: element.transformOriginX ?? 50,
          transformOriginY: element.transformOriginY ?? 50,
        };
      case 'backface':
        return { transformOptions, backfaceVisibility: element.backfaceVisibility ?? 'visible' };
      case 'preserve3d':
        return { transformOptions, preserve3D: element.preserve3D ?? true };
      default:
        return { transformOptions };
    }
  }

  private buildRemoveTransformOptionPatch(
    element: CanvasElement,
    option: CanvasTransformOption,
  ): Partial<CanvasElement> {
    const transformOptions = this.removeTransformOptions(element, option);
    switch (option) {
      case 'scale':
        return { transformOptions, scaleX: undefined, scaleY: undefined };
      case 'rotate':
        return { transformOptions, rotation: undefined, rotationMode: undefined };
      case 'skew':
        return { transformOptions, skewX: undefined, skewY: undefined };
      case 'depth':
        return { transformOptions, depth: undefined };
      case 'perspective':
        return { transformOptions, perspective: undefined };
      case 'origin':
        return { transformOptions, transformOriginX: undefined, transformOriginY: undefined };
      case 'backface':
        return { transformOptions, backfaceVisibility: undefined };
      case 'preserve3d':
        return { transformOptions, preserve3D: undefined };
      default:
        return { transformOptions };
    }
  }

  private buildEffectPreviewTransform(effect: CanvasEffect, identity: boolean): string {
    const offsetX = identity ? 0 : effect.offsetX;
    const offsetY = identity ? 0 : effect.offsetY;
    const scale = identity ? 1 : effect.scale;
    const rotate = identity ? 0 : effect.rotate;
    const skewX = identity ? 0 : effect.skewX;
    const skewY = identity ? 0 : effect.skewY;
    const rotation =
      effect.rotationMode === '3d'
        ? `rotateY(${this.formatEffectPreviewNumber(rotate)}deg)`
        : `rotate(${this.formatEffectPreviewNumber(rotate)}deg)`;
    return [
      `translate(${this.formatEffectPreviewNumber(offsetX)}px, ${this.formatEffectPreviewNumber(offsetY)}px)`,
      `scale(${this.formatEffectPreviewNumber(scale)})`,
      rotation,
      `skew(${this.formatEffectPreviewNumber(skewX)}deg, ${this.formatEffectPreviewNumber(skewY)}deg)`,
    ].join(' ');
  }

  private composeEffectPreviewBackground(fill?: string): string {
    const normalized = fill?.trim();
    if (!normalized) return EFFECT_PREVIEW_BACKGROUND;
    return `linear-gradient(180deg, rgba(255, 255, 255, 0.18), rgba(255, 255, 255, 0.06)), ${normalized}`;
  }

  private composeEffectPreviewShadow(shadow?: string): string {
    const normalized = shadow?.trim();
    return normalized ? getCanvasShadowCss(normalized) : EFFECT_PREVIEW_SHADOW;
  }

  private formatEffectPreviewNumber(value: number): string {
    return String(roundToTwoDecimals(value));
  }

  private formatShadowMetric(value: number): string {
    return roundToTwoDecimals(value).toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
  }

  private lookupEffectOptionLabel(
    options: readonly DropdownSelectOption[],
    value: string,
  ): string | null {
    const match = options.find((option) => option.value === value);
    return typeof match?.label === 'string' ? match.label : null;
  }

  private toHexColorOrFallback(value: string | undefined, fallback: string): string {
    if (!value) return fallback;
    const normalized = value.trim();
    if (normalized.toLowerCase() === 'transparent') return 'transparent';
    if (
      /^#([A-Fa-f0-9]{3}|[A-Fa-f0-9]{4}|[A-Fa-f0-9]{6}|[A-Fa-f0-9]{8})$/.test(normalized) ||
      /^rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}(?:\s*,\s*(?:0|1|0?\.\d+))?\s*\)$/i.test(
        normalized,
      ) ||
      /^hsla?\(\s*[+-]?\d*\.?\d+\s*(?:deg)?\s*,\s*\d*\.?\d+%\s*,\s*\d*\.?\d+%(?:\s*,\s*(?:0|1|0?\.\d+))?\s*\)$/i.test(
        normalized,
      )
    ) {
      return normalized;
    }
    return fallback;
  }
}

function preserveColorDisplayValue(value: string): string {
  return value.startsWith('#') ? value.toUpperCase() : value;
}

function isTransparentColor(value: string): boolean {
  if (value.toLowerCase() === 'transparent') return true;
  if (/^#([A-Fa-f0-9]{4}|[A-Fa-f0-9]{8})$/.test(value)) {
    const alphaHex = value.length === 5 ? value[4] : value.slice(7, 9);
    return alphaHex.toLowerCase() === '0' || alphaHex.toLowerCase() === '00';
  }
  const rgbaMatch = value.match(
    /^rgba\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*(\d*\.?\d+)\s*\)$/i,
  );
  if (rgbaMatch) return Number(rgbaMatch[1]) === 0;
  return false;
}
