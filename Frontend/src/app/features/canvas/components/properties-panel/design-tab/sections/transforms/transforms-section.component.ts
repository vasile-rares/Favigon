import { Component, input, output, ViewEncapsulation } from '@angular/core';
import { ToggleGroupComponent, ContextMenuComponent } from '@app/shared';
import { NumberInputComponent } from '../../../number-input/number-input.component';
import type { ToggleGroupOption, ContextMenuItem } from '@app/shared';
import {
  CanvasBackfaceVisibility,
  CanvasElement,
  CanvasRotationMode,
  CanvasTransformOption,
} from '@app/core';

import { roundToTwoDecimals } from '../../../../../utils/canvas-math.util';

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

@Component({
  selector: 'app-dt-transforms-section',
  standalone: true,
  imports: [ToggleGroupComponent, NumberInputComponent, ContextMenuComponent],
  templateUrl: './transforms-section.component.html',
  encapsulation: ViewEncapsulation.None,
})
export class TransformsSectionComponent {
  readonly element = input.required<CanvasElement>();

  readonly elementPatch = output<Partial<CanvasElement>>();
  readonly numberInputGestureStarted = output<void>();
  readonly numberInputGestureCommitted = output<void>();

  transformMenuItems: ContextMenuItem[] = [];
  transformMenuX = 0;
  transformMenuY = 0;

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

  onNumberInputGestureStarted(): void {
    this.numberInputGestureStarted.emit();
  }

  onNumberInputGestureCommitted(): void {
    this.numberInputGestureCommitted.emit();
  }

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

  private openTransformMenu(event: MouseEvent | null, trigger: HTMLElement | null): void {
    const element = this.element();
    const position = this.resolveMenuPosition(event, trigger);
    if (!position) return;
    if (this.transformMenuItems.length > 0) return;
    this.transformMenuItems = this.buildTransformMenuItems(element);
    this.transformMenuX = position.x;
    this.transformMenuY = position.y;
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
          rotationMode: element.rotationMode ?? '2d',
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
}
