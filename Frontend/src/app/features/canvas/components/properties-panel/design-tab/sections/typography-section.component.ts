import { Component, OnInit, inject, input, output, ViewEncapsulation } from '@angular/core';

import { FormsModule } from '@angular/forms';
import { DropdownSelectComponent, ToggleGroupComponent } from '@app/shared';
import { NumberInputComponent } from '../../number-input/number-input.component';
import { FieldInputComponent } from '../../field-input/field-input.component';
import type { DropdownSelectOption, ToggleGroupOption } from '@app/shared';
import {
  CanvasElement,
  CanvasFontSizeUnit,
  CanvasFontStyle,
  CanvasTextAlign,
  CanvasTextSpacingUnit,
} from '@app/core';

import { roundToTwoDecimals } from '../../../../utils/canvas-math.util';
import { GoogleFontsService } from '../../../../services/google-fonts.service';

type EditableTypographyField =
  | 'fontFamily'
  | 'fontWeight'
  | 'fontStyle'
  | 'textAlign'
  | 'textVerticalAlign';
type EditableTextMetricUnitField = 'fontSizeUnit' | 'letterSpacingUnit' | 'lineHeightUnit';
type EditableNumericTypographyField = 'fontSize' | 'letterSpacing' | 'lineHeight';

@Component({
  selector: 'app-dt-typography-section',
  standalone: true,
  imports: [
    FormsModule,
    DropdownSelectComponent,
    ToggleGroupComponent,
    NumberInputComponent,
    FieldInputComponent,
  ],
  templateUrl: './typography-section.component.html',
  encapsulation: ViewEncapsulation.None,
})
export class TypographySectionComponent implements OnInit {
  private readonly googleFonts = inject(GoogleFontsService);

  readonly element = input.required<CanvasElement>();
  readonly projectId = input<number | null>(null);

  readonly elementPatch = output<Partial<CanvasElement>>();
  readonly numberInputGestureStarted = output<void>();
  readonly numberInputGestureCommitted = output<void>();

  private readonly defaultFillColor = '#e0e0e0';

  readonly fontFamilyOptions: DropdownSelectOption[] = this.googleFonts.fontList.map((f) => ({
    label: f.family,
    value: f.family,
  }));

  ngOnInit(): void {
    // Ensure the current element's font is loaded when the panel opens
    this.googleFonts.ensureLoaded(this.element().fontFamily);
  }
  readonly fontWeightOptions: DropdownSelectOption[] = [
    { label: 'Light', value: 300 },
    { label: 'Regular', value: 400 },
    { label: 'Medium', value: 500 },
    { label: 'Semibold', value: 600 },
    { label: 'Bold', value: 700 },
  ];
  readonly fontSizeUnitOptions: DropdownSelectOption[] = [
    { label: 'Px', value: 'px' },
    { label: 'Rem', value: 'rem' },
  ];
  readonly textSpacingUnitOptions: DropdownSelectOption[] = [
    { label: 'Px', value: 'px' },
    { label: 'Em', value: 'em' },
  ];
  readonly textAlignToggleOptions: readonly ToggleGroupOption[] = [
    {
      label: '',
      value: 'left',
      icon: 'text-align-left',
      ariaLabel: 'Align text left',
      title: 'Left',
    },
    {
      label: '',
      value: 'center',
      icon: 'text-align-center',
      ariaLabel: 'Align text center',
      title: 'Center',
    },
    {
      label: '',
      value: 'right',
      icon: 'text-align-right',
      ariaLabel: 'Align text right',
      title: 'Right',
    },
    {
      label: '',
      value: 'justify',
      icon: 'text-align-justify',
      ariaLabel: 'Justify text',
      title: 'Justify',
    },
  ];

  onNumberInputGestureStarted(): void {
    this.numberInputGestureStarted.emit();
  }

  onNumberInputGestureCommitted(): void {
    this.numberInputGestureCommitted.emit();
  }

  onTextChange(field: 'text', event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.elementPatch.emit({ [field]: value } as Partial<CanvasElement>);
  }

  onNumberChange(field: EditableNumericTypographyField, valueOrEvent: number | Event): void {
    const value =
      typeof valueOrEvent === 'number'
        ? valueOrEvent
        : Number((valueOrEvent.target as HTMLInputElement).value);
    if (!Number.isFinite(value)) return;
    this.elementPatch.emit({ [field]: value } as Partial<CanvasElement>);
  }

  onTypographySelectChange(
    field: EditableTypographyField,
    value: string | number | boolean | null,
  ): void {
    if (field === 'fontWeight') {
      if (typeof value !== 'number') return;
      this.elementPatch.emit({ fontWeight: value });
      return;
    }
    if (typeof value !== 'string') return;
    if (field === 'fontFamily') {
      this.googleFonts.loadFont(value);
    }
    this.elementPatch.emit({ [field]: value } as Partial<CanvasElement>);
  }

  onTextMetricUnitChange(
    field: EditableTextMetricUnitField,
    value: string | number | boolean | null,
  ): void {
    if (typeof value !== 'string') return;
    const element = this.element();

    if (field === 'fontSizeUnit') {
      if (value !== 'px' && value !== 'rem') return;
      const currentUnit = this.fontSizeUnitValue(element);
      if (currentUnit === value) return;
      const currentValue = element.fontSize ?? 16;
      const nextValue =
        currentUnit === 'px'
          ? roundToTwoDecimals(currentValue / 16)
          : roundToTwoDecimals(currentValue * 16);
      this.elementPatch.emit({ fontSize: nextValue, fontSizeUnit: value });
      return;
    }

    if (value !== 'px' && value !== 'em') return;
    const currentValue =
      field === 'lineHeightUnit' ? (element.lineHeight ?? 1.2) : (element.letterSpacing ?? 0);
    const currentUnit =
      field === 'lineHeightUnit'
        ? this.lineHeightUnitValue(element)
        : this.letterSpacingUnitValue(element);
    if (currentUnit === value) return;

    const fontSizeInPixels = this.fontSizeInPixels(element);
    const nextValue =
      currentUnit === 'px'
        ? roundToTwoDecimals(currentValue / fontSizeInPixels)
        : roundToTwoDecimals(currentValue * fontSizeInPixels);

    this.elementPatch.emit(
      field === 'lineHeightUnit'
        ? { lineHeight: nextValue, lineHeightUnit: value }
        : { letterSpacing: nextValue, letterSpacingUnit: value },
    );
  }

  setFontStyle(style: CanvasFontStyle): void {
    this.elementPatch.emit({ fontStyle: style });
  }

  onTextAlignChange(value: string | number | boolean | null): void {
    if (value === 'left' || value === 'center' || value === 'right' || value === 'justify') {
      this.elementPatch.emit({ textAlign: value as CanvasTextAlign });
    }
  }

  fontFamilyValue(element: CanvasElement): string {
    return element.fontFamily ?? 'Inter';
  }

  fontWeightValue(element: CanvasElement): number {
    return element.fontWeight ?? 400;
  }

  fontSizeUnitValue(element: CanvasElement): CanvasFontSizeUnit {
    return element.fontSizeUnit === 'rem' ? 'rem' : 'px';
  }

  fontStyleValue(element: CanvasElement): CanvasFontStyle {
    return element.fontStyle ?? 'normal';
  }

  letterSpacingUnitValue(element: CanvasElement): CanvasTextSpacingUnit {
    return element.letterSpacingUnit === 'em' ? 'em' : 'px';
  }

  lineHeightUnitValue(element: CanvasElement): CanvasTextSpacingUnit {
    return element.lineHeightUnit === 'px' ? 'px' : 'em';
  }

  textAlignValue(element: CanvasElement): CanvasTextAlign {
    return element.textAlign ?? 'center';
  }

  fillLabel(element: CanvasElement): string {
    const value = this.fillInputValue(element);
    return value === 'transparent' ? 'Transparent' : preserveColorDisplayValue(value);
  }

  fillSwatchBackground(element: CanvasElement): string | null {
    const value = this.fillInputValue(element);
    return value === 'transparent' ? null : value;
  }

  isTransparentFill(element: CanvasElement): boolean {
    return isTransparentColor(this.fillInputValue(element));
  }

  fillInputValue(element: CanvasElement): string {
    return this.toHexColorOrFallback(element.fill, this.defaultFillColor);
  }

  fillPickerValue(element: CanvasElement): string {
    const fillValue = this.fillInputValue(element);
    return fillValue !== 'transparent' ? fillValue : this.defaultFillColor;
  }

  private fontSizeInPixels(element: CanvasElement): number {
    const fontSize = element.fontSize ?? 16;
    return this.fontSizeUnitValue(element) === 'rem' ? fontSize * 16 : fontSize;
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
