import { Component, input, output, ViewEncapsulation } from '@angular/core';

import { FormsModule } from '@angular/forms';
import { DropdownSelectComponent, ToggleGroupComponent } from '@app/shared';
import { NumberInputComponent } from '../../../number-input/number-input.component';
import type { DropdownSelectOption, ToggleGroupOption } from '@app/shared';
import {
  CanvasAlignItems,
  CanvasDisplayMode,
  CanvasElement,
  CanvasJustifyContent,
  CanvasSpacing,
} from '@app/core';

import { roundToTwoDecimals } from '../../../../../utils/canvas-math.util';

type PaddingMode = 'full' | 'per-side';

interface PaddingFieldDefinition {
  key: keyof CanvasSpacing;
  label: string;
  ariaLabel: string;
}

const PADDING_FIELD_DEFINITIONS: readonly PaddingFieldDefinition[] = [
  { key: 'top', label: 'T', ariaLabel: 'Padding top' },
  { key: 'right', label: 'R', ariaLabel: 'Padding right' },
  { key: 'left', label: 'L', ariaLabel: 'Padding left' },
  { key: 'bottom', label: 'B', ariaLabel: 'Padding bottom' },
] as const;

@Component({
  selector: 'app-dt-layout-section',
  standalone: true,
  imports: [FormsModule, DropdownSelectComponent, ToggleGroupComponent, NumberInputComponent],
  templateUrl: './layout-section.component.html',
  encapsulation: ViewEncapsulation.None,
})
export class LayoutSectionComponent {
  readonly element = input.required<CanvasElement>();

  readonly elementPatch = output<Partial<CanvasElement>>();
  readonly numberInputGestureStarted = output<void>();
  readonly numberInputGestureCommitted = output<void>();

  private readonly paddingModeOverrides = new Map<string, PaddingMode>();
  private readonly paddingLinkedValues = new Map<string, number>();

  readonly layoutDisplayOptions: readonly ToggleGroupOption[] = [
    { label: 'Flex', value: 'flex' },
    { label: 'Grid', value: 'grid' },
  ];
  readonly layoutDirectionOptions: readonly ToggleGroupOption[] = [
    {
      label: '',
      value: 'row',
      icon: 'direction-horizontal',
      ariaLabel: 'Horizontal layout direction',
      title: 'Distribute',
    },
    {
      label: '',
      value: 'column',
      icon: 'direction-vertical',
      ariaLabel: 'Vertical layout direction',
      title: 'Align',
    },
  ];
  readonly justifyContentOptions: DropdownSelectOption[] = [
    { label: 'Start', value: 'flex-start' },
    { label: 'End', value: 'flex-end' },
    { label: 'Center', value: 'center' },
    { label: 'Space Between', value: 'space-between' },
    { label: 'Space Around', value: 'space-around' },
    { label: 'Space Evenly', value: 'space-evenly' },
  ];
  readonly alignItemsHorizontalOptions: readonly ToggleGroupOption[] = [
    {
      label: '',
      value: 'flex-start',
      icon: 'align-horizontal-start',
      ariaLabel: 'Align start',
      title: 'Start',
    },
    {
      label: '',
      value: 'center',
      icon: 'align-horizontal-center',
      ariaLabel: 'Align center',
      title: 'Center',
    },
    {
      label: '',
      value: 'flex-end',
      icon: 'align-horizontal-end',
      ariaLabel: 'Align end',
      title: 'End',
    },
  ];
  readonly alignItemsVerticalOptions: readonly ToggleGroupOption[] = [
    {
      label: '',
      value: 'flex-start',
      icon: 'align-vertical-start',
      ariaLabel: 'Align start',
      title: 'Start',
    },
    {
      label: '',
      value: 'center',
      icon: 'align-vertical-center',
      ariaLabel: 'Align center',
      title: 'Center',
    },
    {
      label: '',
      value: 'flex-end',
      icon: 'align-vertical-end',
      ariaLabel: 'Align end',
      title: 'End',
    },
  ];
  readonly wrapOptions: readonly ToggleGroupOption[] = [
    { label: 'Yes', value: true },
    { label: 'No', value: false },
  ];
  readonly paddingModeOptions: readonly ToggleGroupOption[] = [
    {
      label: '',
      value: 'full',
      icon: 'spacing-all',
      ariaLabel: 'Use uniform padding',
      title: 'Uniform padding',
    },
    {
      label: '',
      value: 'per-side',
      icon: 'spacing-sides',
      ariaLabel: 'Use per-side padding',
      title: 'Per-side padding',
    },
  ];
  readonly paddingFields = PADDING_FIELD_DEFINITIONS;

  onNumberInputGestureStarted(): void {
    this.numberInputGestureStarted.emit();
  }

  onNumberInputGestureCommitted(): void {
    this.numberInputGestureCommitted.emit();
  }

  supportsLayout(type: CanvasElement['type']): boolean {
    return type === 'frame' || type === 'rectangle';
  }

  hasLayout(element: CanvasElement): boolean {
    return !!element.display;
  }

  onLayoutSectionHeaderClick(): void {
    if (this.hasLayout(this.element())) {
      this.removeLayout();
      return;
    }
    this.addLayout();
  }

  onLayoutSectionToggleClick(event: MouseEvent): void {
    event.stopPropagation();
    this.onLayoutSectionHeaderClick();
  }

  addLayout(): void {
    this.elementPatch.emit({ display: 'flex', justifyContent: 'center', alignItems: 'center' });
  }

  removeLayout(): void {
    this.elementPatch.emit({
      display: undefined,
      flexDirection: undefined,
      flexWrap: undefined,
      justifyContent: undefined,
      alignItems: undefined,
      gap: undefined,
      gapX: undefined,
      gapY: undefined,
      gridTemplateColumns: undefined,
      gridTemplateRows: undefined,
      padding: undefined,
    });
  }

  displayValue(element: CanvasElement): 'flex' | 'grid' {
    return element.display === 'grid' ? 'grid' : 'flex';
  }

  onDisplayChange(value: string | number | boolean): void {
    if (value !== 'flex' && value !== 'grid') return;
    this.elementPatch.emit({ display: value as CanvasDisplayMode });
  }

  isFlex(element: CanvasElement): boolean {
    return this.displayValue(element) === 'flex';
  }

  isGrid(element: CanvasElement): boolean {
    return this.displayValue(element) === 'grid';
  }

  flexDirectionValue(element: CanvasElement): 'row' | 'column' {
    return element.flexDirection === 'column' || element.flexDirection === 'column-reverse'
      ? 'column'
      : 'row';
  }

  onFlexDirectionChange(value: string | number | boolean): void {
    if (value !== 'row' && value !== 'column') return;
    this.elementPatch.emit({ flexDirection: value });
  }

  justifyContentAxisLabel(_element: CanvasElement): string {
    return 'Distribute';
  }

  justifyContentPlaceholder(element: CanvasElement): string {
    return `Select ${this.justifyContentAxisLabel(element).toLowerCase()} alignment`;
  }

  justifyContentValue(element: CanvasElement): CanvasJustifyContent {
    return element.justifyContent ?? 'flex-start';
  }

  onJustifyContentChange(value: string | number | boolean | null): void {
    if (typeof value !== 'string') return;
    this.elementPatch.emit({ justifyContent: value as CanvasJustifyContent });
  }

  alignItemsAxisLabel(_element: CanvasElement): string {
    return 'Align';
  }

  alignItemsAriaLabel(element: CanvasElement): string {
    return `${this.alignItemsAxisLabel(element)} layout alignment`;
  }

  alignItemsOptions(element: CanvasElement): readonly ToggleGroupOption[] {
    return this.flexDirectionValue(element) === 'column'
      ? this.alignItemsHorizontalOptions
      : this.alignItemsVerticalOptions;
  }

  alignItemsValue(element: CanvasElement): CanvasAlignItems {
    return element.alignItems === 'center' || element.alignItems === 'flex-end'
      ? element.alignItems
      : 'flex-start';
  }

  onAlignItemsChange(value: string | number | boolean | null): void {
    if (typeof value !== 'string') return;
    this.elementPatch.emit({ alignItems: value as CanvasAlignItems });
  }

  flexWrapValue(element: CanvasElement): boolean {
    return element.flexWrap === 'wrap';
  }

  onFlexWrapToggle(wrap: boolean): void {
    this.elementPatch.emit({ flexWrap: wrap ? 'wrap' : 'nowrap' } as Partial<CanvasElement>);
  }

  onNumberChange(field: 'gap', value: number | Event): void {
    const numValue =
      typeof value === 'number' ? value : Number((value.target as HTMLInputElement).value);
    if (!Number.isFinite(numValue)) return;
    this.elementPatch.emit({ [field]: numValue } as Partial<CanvasElement>);
  }

  gridColumnsValue(element: CanvasElement): number {
    return resolveGridTrackCount(element.gridTemplateColumns, 2);
  }

  gridRowsValue(element: CanvasElement): number {
    return resolveGridTrackCount(element.gridTemplateRows, 1);
  }

  gridGapXValue(element: CanvasElement): number {
    return typeof element.gapX === 'number' ? element.gapX : (element.gap ?? 0);
  }

  gridGapYValue(element: CanvasElement): number {
    return typeof element.gapY === 'number' ? element.gapY : (element.gap ?? 0);
  }

  onGridTrackCountChange(field: 'gridTemplateColumns' | 'gridTemplateRows', value: number): void {
    if (!Number.isFinite(value)) return;
    this.elementPatch.emit({
      [field]: buildRepeatedGridTrackTemplate(Math.max(1, Math.round(value))),
    } as Partial<CanvasElement>);
  }

  onGridGapChange(axis: 'x' | 'y', value: number): void {
    if (!Number.isFinite(value)) return;
    const element = this.element();
    const normalized = Math.max(0, roundToTwoDecimals(value));
    this.elementPatch.emit({
      gap: undefined,
      gapX: axis === 'x' ? normalized : this.gridGapXValue(element),
      gapY: axis === 'y' ? normalized : this.gridGapYValue(element),
    });
  }

  paddingMode(element: CanvasElement): PaddingMode {
    return (
      this.paddingModeOverrides.get(element.id) ??
      (this.hasPerSidePadding(element) ? 'per-side' : 'full')
    );
  }

  fullPaddingInputValue(element: CanvasElement): number | null {
    return this.paddingMode(element) === 'per-side' ? null : this.uniformPaddingValue(element);
  }

  uniformPaddingValue(element: CanvasElement): number {
    const padding = this.getSpacingValues(element, 'padding');
    if (!this.hasPerSidePadding(element)) return padding.top;
    return this.paddingLinkedValues.get(element.id) ?? padding.top;
  }

  onPaddingModeChange(value: string | number | boolean | null): void {
    if (value !== 'full' && value !== 'per-side') return;
    const element = this.element();
    const currentPadding = this.getSpacingValues(element, 'padding');
    const linkedValue = this.uniformPaddingValue(element);
    this.paddingModeOverrides.set(element.id, value);
    this.paddingLinkedValues.set(element.id, linkedValue);
    if (value === 'per-side') {
      this.elementPatch.emit({ padding: currentPadding });
      return;
    }
    const nextValue = Math.max(0, roundToTwoDecimals(linkedValue));
    this.elementPatch.emit({
      padding: { top: nextValue, right: nextValue, bottom: nextValue, left: nextValue },
    });
  }

  onPaddingFullChange(value: number): void {
    if (!Number.isFinite(value)) return;
    const element = this.element();
    const nextValue = Math.max(0, roundToTwoDecimals(value));
    this.paddingModeOverrides.set(element.id, 'full');
    this.paddingLinkedValues.set(element.id, nextValue);
    this.elementPatch.emit({
      padding: { top: nextValue, right: nextValue, bottom: nextValue, left: nextValue },
    });
  }

  spacingValue(
    element: CanvasElement,
    type: 'padding' | 'margin',
    side: keyof CanvasSpacing,
  ): number {
    return element[type]?.[side] ?? 0;
  }

  onPaddingSideChange(side: keyof CanvasSpacing, value: number): void {
    if (!Number.isFinite(value)) return;
    const element = this.element();
    const currentPadding = this.getSpacingValues(element, 'padding');
    this.paddingModeOverrides.set(element.id, 'per-side');
    this.elementPatch.emit({
      padding: { ...currentPadding, [side]: Math.max(0, roundToTwoDecimals(value)) },
    });
  }

  private getSpacingValues(element: CanvasElement, type: 'padding' | 'margin'): CanvasSpacing {
    return element[type] ?? { top: 0, right: 0, bottom: 0, left: 0 };
  }

  private hasPerSidePadding(element: CanvasElement): boolean {
    const padding = this.getSpacingValues(element, 'padding');
    return !(
      padding.top === padding.right &&
      padding.top === padding.bottom &&
      padding.top === padding.left
    );
  }
}

function buildRepeatedGridTrackTemplate(count: number): string {
  return `repeat(${Math.max(1, Math.round(count))}, minmax(0, 1fr))`;
}

function resolveGridTrackCount(template: string | undefined, fallback: number): number {
  const normalized = template?.trim();
  if (!normalized) return fallback;
  const repeatMatch = normalized.match(/^repeat\(\s*(\d+)\s*,/i);
  if (repeatMatch) return Math.max(1, Number.parseInt(repeatMatch[1], 10));
  const tracks = splitGridTrackTemplate(normalized);
  return tracks.length > 0 ? tracks.length : fallback;
}

function splitGridTrackTemplate(template: string): string[] {
  const tracks: string[] = [];
  let depth = 0;
  let token = '';
  for (const char of template.trim()) {
    if (char === '(') {
      depth++;
      token += char;
      continue;
    }
    if (char === ')') {
      depth = Math.max(0, depth - 1);
      token += char;
      continue;
    }
    if (/\s/.test(char) && depth === 0) {
      if (token.trim().length > 0) {
        tracks.push(token.trim());
        token = '';
      }
      continue;
    }
    token += char;
  }
  if (token.trim().length > 0) tracks.push(token.trim());
  return tracks;
}
