import { Component, EventEmitter, Input, Output, ViewEncapsulation } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ToggleGroupComponent } from '@app/shared';
import { NumberInputComponent } from '../../number-input/number-input.component';
import { FieldInputComponent } from '../../field-input/field-input.component';
import type { ToggleGroupOption } from '@app/shared';
import {
  CanvasBorderSides,
  CanvasBorderWidths,
  CanvasCornerRadii,
  CanvasElement,
  CanvasOverflowMode,
} from '@app/core';

import {
  getDefaultCornerRadius,
  getResolvedCornerRadii,
  hasPerCornerRadius,
} from '../../../../utils/element/canvas-element-normalization.util';
import { roundToTwoDecimals } from '../../../../utils/canvas-math.util';
import {
  buildCanvasShadowCss,
  DEFAULT_EDITABLE_CANVAS_SHADOW,
  hasCanvasShadow,
  normalizeCanvasShadowValue,
  resolveEditableCanvasShadow,
} from '../../../../utils/element/canvas-shadow.util';
import { DropdownSelectComponent } from '@app/shared';
import type { DropdownSelectOption } from '@app/shared';

type CornerRadiusMode = 'full' | 'per-corner';
type EditableNumericField = 'opacity' | 'cornerRadius';

interface CornerRadiusFieldDefinition {
  key: keyof CanvasCornerRadii;
  label: string;
  ariaLabel: string;
}

const CORNER_RADIUS_FIELD_DEFINITIONS: readonly CornerRadiusFieldDefinition[] = [
  { key: 'topLeft', label: 'TL', ariaLabel: 'Top left corner radius' },
  { key: 'topRight', label: 'TR', ariaLabel: 'Top right corner radius' },
  { key: 'bottomLeft', label: 'BL', ariaLabel: 'Bottom left corner radius' },
  { key: 'bottomRight', label: 'BR', ariaLabel: 'Bottom right corner radius' },
] as const;

@Component({
  selector: 'app-dt-appearance-section',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    DropdownSelectComponent,
    ToggleGroupComponent,
    NumberInputComponent,
    FieldInputComponent,
  ],
  templateUrl: './appearance-section.component.html',
  encapsulation: ViewEncapsulation.None,
})
export class AppearanceSectionComponent {
  @Input() element!: CanvasElement;
  @Input() projectId: number | null = null;
  @Input() autoOpenFillPopupElementId: string | null = null;

  @Output() elementPatch = new EventEmitter<Partial<CanvasElement>>();
  @Output() numberInputGestureStarted = new EventEmitter<void>();
  @Output() numberInputGestureCommitted = new EventEmitter<void>();

  readonly overflowOptions: DropdownSelectOption[] = [
    { label: 'Clip', value: 'clip' },
    { label: 'Visible', value: 'visible' },
    { label: 'Hidden', value: 'hidden' },
    { label: 'Scroll', value: 'scroll' },
  ];
  readonly shadowActivationPatch: Partial<CanvasElement> = {
    shadow: buildCanvasShadowCss(DEFAULT_EDITABLE_CANVAS_SHADOW),
  };
  readonly shadowClearPatch: Partial<CanvasElement> = { shadow: undefined };
  readonly visibleOptions: readonly ToggleGroupOption[] = [
    { label: 'Yes', value: true },
    { label: 'No', value: false },
  ];
  readonly cornerRadiusModeOptions: readonly ToggleGroupOption[] = [
    {
      label: '',
      value: 'full',
      icon: 'radius-full',
      ariaLabel: 'Use full corner radius',
      title: 'Full radius',
    },
    {
      label: '',
      value: 'per-corner',
      icon: 'radius-corners',
      ariaLabel: 'Use per-corner radius',
      title: 'Per-corner radius',
    },
  ];
  readonly cornerRadiusFields = CORNER_RADIUS_FIELD_DEFINITIONS;
  readonly borderStyleOptions = ['Solid', 'Dashed', 'Dotted', 'Double'];

  private readonly defaultFillColor = '#e0e0e0';
  private readonly defaultFrameFillColor = '#3f3f46';
  private readonly defaultStrokeColor = '#52525b';

  onNumberInputGestureStarted(): void {
    this.numberInputGestureStarted.emit();
  }

  onNumberInputGestureCommitted(): void {
    this.numberInputGestureCommitted.emit();
  }

  onNumberChange(field: EditableNumericField, valueOrEvent: number | Event): void {
    const value =
      typeof valueOrEvent === 'number'
        ? valueOrEvent
        : Number((valueOrEvent.target as HTMLInputElement).value);
    if (!Number.isFinite(value)) return;

    const element = this.element;
    if (field === 'cornerRadius' && this.cornerRadiusMode(element) === 'per-corner') {
      this.elementPatch.emit({
        cornerRadius: Math.max(0, roundToTwoDecimals(value)),
        cornerRadii: undefined,
      });
      return;
    }
    this.elementPatch.emit({ [field]: value } as Partial<CanvasElement>);
  }

  opacitySliderPercent(element: CanvasElement): string {
    const value = Number.isFinite(element.opacity ?? Number.NaN) ? (element.opacity as number) : 1;
    return `${Math.max(0, Math.min(100, Math.round(value * 100)))}%`;
  }

  isVisible(element: CanvasElement): boolean {
    return element.visible !== false;
  }

  setVisible(visible: boolean): void {
    this.elementPatch.emit({ visible });
  }

  hasFill(type: CanvasElement['type']): boolean {
    return type !== 'text' && type !== 'image';
  }

  isTransparentFill(element: CanvasElement): boolean {
    if (element.fillMode === 'image') return false;
    return isTransparentColor(this.fillInputValue(element));
  }

  fillLabel(element: CanvasElement): string {
    if (element.fillMode === 'image') return 'Image';
    const value = this.fillInputValue(element);
    return value === 'transparent' ? 'Transparent' : preserveColorDisplayValue(value);
  }

  fillSwatchBackground(element: CanvasElement): string | null {
    if (element.fillMode === 'image' && element.backgroundImage) {
      return `url(${element.backgroundImage}) center/cover no-repeat`;
    }
    const value = this.fillInputValue(element);
    return value === 'transparent' ? null : value;
  }

  fillInputValue(element: CanvasElement): string {
    const fallback = element.type === 'frame' ? this.defaultFrameFillColor : this.defaultFillColor;
    return this.toHexColorOrFallback(element.fill, fallback);
  }

  fillPickerValue(element: CanvasElement): string {
    const fillValue = this.fillInputValue(element);
    if (fillValue !== 'transparent') return fillValue;
    return element.type === 'frame' ? this.defaultFrameFillColor : this.defaultFillColor;
  }

  supportsOverflow(type: CanvasElement['type']): boolean {
    return type === 'frame' || type === 'rectangle';
  }

  overflowValue(element: CanvasElement): CanvasOverflowMode {
    return element.overflow ?? 'clip';
  }

  onOverflowChange(value: string | number | boolean | null): void {
    if (typeof value !== 'string') return;
    this.elementPatch.emit({ overflow: value as CanvasOverflowMode });
  }

  supportsCornerRadius(type: CanvasElement['type']): boolean {
    return type !== 'text';
  }

  cornerRadiusMode(element: CanvasElement): CornerRadiusMode {
    return hasPerCornerRadius(element) ? 'per-corner' : 'full';
  }

  fullCornerRadiusInputValue(element: CanvasElement): number | null {
    return this.cornerRadiusMode(element) === 'per-corner' ? null : getDefaultCornerRadius(element);
  }

  cornerRadiusValue(element: CanvasElement, corner: keyof CanvasCornerRadii): number {
    return getResolvedCornerRadii(element)[corner];
  }

  onCornerRadiusModeChange(value: string | number | boolean | null): void {
    if (value !== 'full' && value !== 'per-corner') return;
    const element = this.element;
    const uniformValue = getDefaultCornerRadius(element);
    if (value === 'per-corner') {
      this.elementPatch.emit({
        cornerRadius: uniformValue,
        cornerRadii: getResolvedCornerRadii(element),
      });
      return;
    }
    this.elementPatch.emit({ cornerRadius: uniformValue, cornerRadii: undefined });
  }

  onCornerRadiusCornerChange(corner: keyof CanvasCornerRadii, value: number): void {
    if (!Number.isFinite(value)) return;
    const nextRadii = {
      ...getResolvedCornerRadii(this.element),
      [corner]: Math.max(0, roundToTwoDecimals(value)),
    } satisfies CanvasCornerRadii;
    this.elementPatch.emit({ cornerRadii: nextRadii });
  }

  hasStroke(type: CanvasElement['type']): boolean {
    return type !== 'text';
  }

  hasActiveBorder(element: CanvasElement): boolean {
    if (!element.stroke) return false;
    if (element.strokeWidths) return Object.values(element.strokeWidths).some((v) => v > 0);
    return (element.strokeWidth ?? 1) > 0;
  }

  borderSummary(element: CanvasElement): string {
    return this.borderStyleValue(element);
  }

  borderStyleValue(element: CanvasElement): string {
    return element.strokeStyle ?? 'Solid';
  }

  strokeSwatchBackground(element: CanvasElement): string {
    return this.strokeInputValue(element);
  }

  strokeInputValue(element: CanvasElement): string {
    return this.toHexColorOrFallback(element.stroke, this.defaultStrokeColor);
  }

  strokeSidesValue(element: CanvasElement): CanvasBorderSides | null {
    if (element.strokeSides) return element.strokeSides;
    if (!element.strokeWidths) return null;
    return {
      top: element.strokeWidths.top > 0,
      right: element.strokeWidths.right > 0,
      bottom: element.strokeWidths.bottom > 0,
      left: element.strokeWidths.left > 0,
    };
  }

  strokeWidthsValue(element: CanvasElement): CanvasBorderWidths | null {
    return element.strokeWidths ?? null;
  }

  supportsShadow(type: CanvasElement['type']): boolean {
    return type !== 'text';
  }

  hasActiveShadow(element: CanvasElement): boolean {
    return hasCanvasShadow(element.shadow);
  }

  shadowSummary(element: CanvasElement): string {
    if (!hasCanvasShadow(element.shadow)) return 'None';
    const shadow = resolveEditableCanvasShadow(element.shadow);
    return `${this.formatShadowMetric(shadow.x)}, ${this.formatShadowMetric(shadow.y)}, ${this.formatShadowMetric(shadow.spread)}`;
  }

  shadowValue(element: CanvasElement): string | null {
    return normalizeCanvasShadowValue(element.shadow) ?? null;
  }

  private formatShadowMetric(value: number): string {
    return roundToTwoDecimals(value).toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
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
