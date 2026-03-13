import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import {
  CanvasElement,
  CanvasElementType,
  CanvasFontStyle,
  CanvasTextAlign,
  CanvasTextVerticalAlign,
} from '../../../../core/models/canvas.models';
import { IRNode } from '../../../../core/models/ir.models';
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
  imports: [CommonModule],
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

  toDisplayNumber(value: number | undefined): string {
    if (!Number.isFinite(value ?? Number.NaN)) {
      return '';
    }

    return roundToTwoDecimals(value as number).toString();
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
    return type !== 'circle' && type !== 'text';
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

  onNumberChange(field: EditableNumericField, event: Event): void {
    const value = Number((event.target as HTMLInputElement).value);
    if (!Number.isFinite(value)) {
      return;
    }

    const rounded = roundToTwoDecimals(value);
    (event.target as HTMLInputElement).value = rounded.toString();
    this.emitPatch({ [field]: rounded } as Partial<CanvasElement>);
  }

  onFillChange(event: Event): void {
    const fill = (event.target as HTMLInputElement).value;
    this.emitPatch({ fill });
  }

  onStrokeChange(event: Event): void {
    const stroke = (event.target as HTMLInputElement).value;
    this.emitPatch({ stroke });
  }

  onBorderStyleChange(event: Event): void {
    const strokeStyle = (event.target as HTMLSelectElement).value;
    this.emitPatch({ strokeStyle });
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

  fillInputValue(element: CanvasElement): string {
    const fallback = element.type === 'frame' ? this.defaultFrameFillColor : this.defaultFillColor;
    return this.toHexColorOrFallback(element.fill, fallback);
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

  private emitPatch(patch: Partial<CanvasElement>): void {
    this.elementPatch.emit(patch);
  }


  private toHexColorOrFallback(value: string | undefined, fallback: string): string {
    if (!value) {
      return fallback;
    }

    const normalized = value.trim();
    if (/^#([A-Fa-f0-9]{3}|[A-Fa-f0-9]{6})$/.test(normalized)) {
      return normalized;
    }

    return fallback;
  }
}
