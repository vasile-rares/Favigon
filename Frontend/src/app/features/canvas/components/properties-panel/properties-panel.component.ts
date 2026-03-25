import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import {
  CanvasElement,
  CanvasElementType,
  CanvasFontStyle,
  CanvasOverflowMode,
  CanvasShadowPreset,
  CanvasTextAlign,
  CanvasTextVerticalAlign,
} from '../../../../core/models/canvas.models';
import { IRNode } from '../../../../core/models/ir.models';
import { NumberInputComponent } from './number-input/number-input.component';
import { StylePopupFieldComponent } from './style-popup-field/style-popup-field.component';
import { formatCanvasElementTypeLabel } from '../../utils/canvas-label.util';
import { roundToTwoDecimals } from '../../utils/canvas-interaction.util';
import { SupportedFramework } from '../../canvas.types';
type PropertiesTab = 'design' | 'prototype';

type EditableNumericField =
  | 'x'
  | 'y'
  | 'width'
  | 'height'
  | 'rotation'
  | 'fontSize'
  | 'letterSpacing'
  | 'lineHeight'
  | 'strokeWidth'
  | 'opacity'
  | 'cornerRadius';

type EditableTypographyField =
  | 'fontFamily'
  | 'fontWeight'
  | 'fontStyle'
  | 'textAlign'
  | 'textVerticalAlign';

interface FrameTemplate {
  name: string;
  sizeLabel: string;
  width: number;
  height: number;
}

@Component({
  selector: 'app-properties-panel',
  standalone: true,
  imports: [CommonModule, NumberInputComponent, StylePopupFieldComponent],
  templateUrl: './properties-panel.component.html',
  styleUrl: './properties-panel.component.css',
})
export class PropertiesPanelComponent {
  @Input() selectedElement: CanvasElement | null = null;
  @Input() currentTool: CanvasElementType | 'select' = 'select';
  @Input() selectedFramework: SupportedFramework = 'html';
  @Input() validationResult: boolean | null = null;
  @Input() apiError: string | null = null;
  @Input() isValidating = false;
  @Input() isGenerating = false;
  @Input() generatedHtml = '';
  @Input() generatedCss = '';
  @Input() irPreview: IRNode | null = null;

  @Output() elementPatch = new EventEmitter<Partial<CanvasElement>>();
  @Output() numberInputGestureStarted = new EventEmitter<void>();
  @Output() numberInputGestureCommitted = new EventEmitter<void>();
  @Output() frameTemplateSelected = new EventEmitter<FrameTemplate>();
  @Output() frameworkChanged = new EventEmitter<SupportedFramework>();
  @Output() validateRequested = new EventEmitter<void>();
  @Output() generateRequested = new EventEmitter<void>();

  activeTab: PropertiesTab = 'design';

  readonly borderStyleOptions = ['Solid', 'Dashed', 'Dotted', 'Double'];
  readonly fontFamilyOptions = [
    'Inter',
    'Poppins',
    'Montserrat',
    'Space Grotesk',
    'Georgia',
    'Arial',
  ];
  readonly fontWeightOptions = [300, 400, 500, 600, 700];
  readonly fontStyleOptions: CanvasFontStyle[] = ['normal', 'italic'];
  readonly textAlignOptions: CanvasTextAlign[] = ['left', 'center', 'right'];
  readonly textVerticalAlignOptions: CanvasTextVerticalAlign[] = ['top', 'middle', 'bottom'];
  readonly overflowOptions: CanvasOverflowMode[] = ['clip', 'visible'];
  readonly shadowOptions: CanvasShadowPreset[] = ['sm', 'md', 'lg', 'xl'];

  readonly frameTemplates: FrameTemplate[] = [
    {
      name: 'iPhone',
      sizeLabel: '390 × 844',
      width: 390,
      height: 844,
    },
    {
      name: 'Tablet',
      sizeLabel: '820 × 1180',
      width: 820,
      height: 1180,
    },
    {
      name: 'Desktop',
      sizeLabel: '1440 × 900',
      width: 1440,
      height: 900,
    },
  ];

  private readonly defaultFillColor = '#e0e0e0';
  private readonly defaultFrameFillColor = '#3f3f46';
  private readonly defaultStrokeColor = '#52525b';

  selectTab(tab: PropertiesTab): void {
    this.activeTab = tab;
  }

  isTabActive(tab: PropertiesTab): boolean {
    return this.activeTab === tab;
  }

  onFrameworkChange(event: Event): void {
    const framework = (event.target as HTMLSelectElement).value as SupportedFramework;
    this.frameworkChanged.emit(framework);
  }

  toDisplayInt(value: number | undefined): string {
    if (!Number.isFinite(value ?? Number.NaN)) {
      return '';
    }

    return Math.round(value as number).toString();
  }

  get elementTypeLabel(): string {
    if (!this.selectedElement) {
      return '';
    }

    return formatCanvasElementTypeLabel(this.selectedElement.type);
  }

  hasFill(type: CanvasElementType): boolean {
    return type !== 'text' && type !== 'image';
  }

  hasStroke(type: CanvasElementType): boolean {
    return type !== 'text';
  }

  supportsCornerRadius(type: CanvasElementType): boolean {
    return type !== 'text';
  }

  isFrame(type: CanvasElementType): boolean {
    return type === 'frame';
  }

  isFrameToolSelected(): boolean {
    return this.currentTool === 'frame';
  }

  isText(type: CanvasElementType): boolean {
    return type === 'text';
  }

  isImage(type: CanvasElementType): boolean {
    return type === 'image';
  }

  supportsOverflow(type: CanvasElementType): boolean {
    return type === 'frame';
  }

  supportsShadow(type: CanvasElementType): boolean {
    return type !== 'text';
  }

  onNumberChange(field: EditableNumericField, valueOrEvent: number | Event): void {
    const value =
      typeof valueOrEvent === 'number'
        ? valueOrEvent
        : Number((valueOrEvent.target as HTMLInputElement).value);

    if (!Number.isFinite(value)) {
      return;
    }

    this.emitPatch({ [field]: value } as Partial<CanvasElement>);
  }

  onNumberInputGestureStarted(): void {
    this.numberInputGestureStarted.emit();
  }

  onNumberInputGestureCommitted(): void {
    this.numberInputGestureCommitted.emit();
  }

  onOverflowChange(event: Event): void {
    const overflow = (event.target as HTMLSelectElement).value as CanvasOverflowMode;
    this.emitPatch({ overflow });
  }

  onTypographySelectChange(field: EditableTypographyField, event: Event): void {
    const value = (event.target as HTMLSelectElement).value;

    if (field === 'fontWeight') {
      this.emitPatch({ fontWeight: Number(value) });
      return;
    }

    this.emitPatch({ [field]: value } as Partial<CanvasElement>);
  }

  borderStyleValue(element: CanvasElement): string {
    return element.strokeStyle ?? 'Solid';
  }

  overflowValue(element: CanvasElement): CanvasOverflowMode {
    return element.overflow ?? 'clip';
  }

  shadowValue(element: CanvasElement): CanvasShadowPreset {
    return element.shadow ?? 'none';
  }

  isVisible(element: CanvasElement): boolean {
    return element.visible !== false;
  }

  hasActiveBorder(element: CanvasElement): boolean {
    return !!element.stroke && (element.strokeWidth ?? 1) > 0;
  }

  hasActiveShadow(element: CanvasElement): boolean {
    return (element.shadow ?? 'none') !== 'none';
  }

  fillInputValue(element: CanvasElement): string {
    const fallback = element.type === 'frame' ? this.defaultFrameFillColor : this.defaultFillColor;
    return this.toHexColorOrFallback(element.fill, fallback);
  }

  fillPickerValue(element: CanvasElement): string {
    const fillValue = this.fillInputValue(element);
    if (fillValue !== 'transparent') {
      return fillValue;
    }

    return element.type === 'frame' ? this.defaultFrameFillColor : this.defaultFillColor;
  }

  strokeInputValue(element: CanvasElement): string {
    return this.toHexColorOrFallback(element.stroke, this.defaultStrokeColor);
  }

  applyFrameTemplate(template: FrameTemplate): void {
    this.frameTemplateSelected.emit(template);
  }

  onTextChange(field: 'text' | 'imageUrl', event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.emitPatch({ [field]: value } as Partial<CanvasElement>);
  }

  fontFamilyValue(element: CanvasElement): string {
    return element.fontFamily ?? 'Inter';
  }

  fontWeightValue(element: CanvasElement): number {
    return element.fontWeight ?? 400;
  }

  fontStyleValue(element: CanvasElement): CanvasFontStyle {
    return element.fontStyle ?? 'normal';
  }

  textAlignValue(element: CanvasElement): CanvasTextAlign {
    return element.textAlign ?? 'center';
  }

  textVerticalAlignValue(element: CanvasElement): CanvasTextVerticalAlign {
    return element.textVerticalAlign ?? 'middle';
  }

  fillLabel(element: CanvasElement): string {
    const value = this.fillInputValue(element);
    return value === 'transparent' ? 'Transparent' : preserveColorDisplayValue(value);
  }

  borderSummary(element: CanvasElement): string {
    return `${this.toDisplayInt(element.strokeWidth ?? 1)}px ${this.borderStyleValue(element)}`;
  }

  shadowSummary(element: CanvasElement): string {
    return (element.shadow ?? 'none').toUpperCase();
  }

  isTransparentFill(element: CanvasElement): boolean {
    return isTransparentColor(this.fillInputValue(element));
  }

  fillSwatchBackground(element: CanvasElement): string | null {
    const value = this.fillInputValue(element);
    return value === 'transparent' ? null : value;
  }

  strokeSwatchBackground(element: CanvasElement): string {
    return this.strokeInputValue(element);
  }

  setVisible(visible: boolean): void {
    this.emitPatch({ visible });
  }

  setFontStyle(style: CanvasFontStyle): void {
    this.emitPatch({ fontStyle: style });
  }

  setTextAlign(align: CanvasTextAlign): void {
    this.emitPatch({ textAlign: align });
  }

  setTextVerticalAlign(align: CanvasTextVerticalAlign): void {
    this.emitPatch({ textVerticalAlign: align });
  }

  private emitPatch(patch: Partial<CanvasElement>): void {
    this.elementPatch.emit(patch);
  }

  private toHexColorOrFallback(value: string | undefined, fallback: string): string {
    if (!value) {
      return fallback;
    }

    const normalized = value.trim();
    if (normalized.toLowerCase() === 'transparent') {
      return 'transparent';
    }

    if (
      /^#([A-Fa-f0-9]{3}|[A-Fa-f0-9]{4}|[A-Fa-f0-9]{6}|[A-Fa-f0-9]{8})$/.test(normalized) ||
      /^rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}(?:\s*,\s*(?:0|1|0?\.\d+))?\s*\)$/i.test(
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
  if (value.toLowerCase() === 'transparent') {
    return true;
  }

  if (/^#([A-Fa-f0-9]{4}|[A-Fa-f0-9]{8})$/.test(value)) {
    const alphaHex = value.length === 5 ? value[4] : value.slice(7, 9);
    return alphaHex.toLowerCase() === '0' || alphaHex.toLowerCase() === '00';
  }

  const rgbaMatch = value.match(
    /^rgba\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*(\d*\.?\d+)\s*\)$/i,
  );
  if (!rgbaMatch) {
    return false;
  }

  return Number(rgbaMatch[1]) === 0;
}
