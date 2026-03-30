import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  DropdownSelectComponent,
  DropdownSelectOption,
} from '../../../../shared/components/dropdown-select/dropdown-select.component';
import {
  CanvasAlignItems,
  CanvasDisplayMode,
  CanvasElement,
  CanvasElementType,
  CanvasFontSizeUnit,
  CanvasFontStyle,
  CanvasFlexDirection,
  CanvasFlexWrap,
  CanvasJustifyContent,
  CanvasOverflowMode,
  CanvasPositionMode,
  CanvasShadowPreset,
  CanvasSpacing,
  CanvasTextSpacingUnit,
  CanvasTextAlign,
  CanvasTextVerticalAlign,
} from '../../../../core/models/canvas.models';
import { IRNode } from '../../../../core/models/ir.models';
import { NumberInputComponent } from './number-input/number-input.component';
import { StylePopupFieldComponent } from './style-popup-field/style-popup-field.component';
import { ToggleGroupComponent, ToggleGroupOption } from './toggle-group/toggle-group.component';
import { formatCanvasElementTypeLabel } from '../../utils/canvas-label.util';
import { roundToTwoDecimals } from '../../utils/canvas-interaction.util';
import { SupportedFramework } from '../../canvas.types';
type PropertiesTab = 'design' | 'prototype';

type EditableNumericField =
  | 'x'
  | 'y'
  | 'width'
  | 'height'
  | 'fontSize'
  | 'letterSpacing'
  | 'lineHeight'
  | 'strokeWidth'
  | 'opacity'
  | 'cornerRadius'
  | 'gap';

type EditableTypographyField =
  | 'fontFamily'
  | 'fontWeight'
  | 'fontStyle'
  | 'textAlign'
  | 'textVerticalAlign';

type EditableTextMetricUnitField = 'fontSizeUnit' | 'letterSpacingUnit' | 'lineHeightUnit';

interface FrameTemplate {
  name: string;
  sizeLabel: string;
  width: number;
  height: number;
}

@Component({
  selector: 'app-properties-panel',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    DropdownSelectComponent,
    NumberInputComponent,
    StylePopupFieldComponent,
    ToggleGroupComponent,
  ],
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
  readonly fontFamilyOptions: DropdownSelectOption[] = [
    { label: 'Inter', value: 'Inter' },
    { label: 'Poppins', value: 'Poppins' },
    { label: 'Montserrat', value: 'Montserrat' },
    { label: 'Space Grotesk', value: 'Space Grotesk' },
    { label: 'Georgia', value: 'Georgia' },
    { label: 'Arial', value: 'Arial' },
  ];
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
  readonly overflowOptions: CanvasOverflowMode[] = ['clip', 'visible'];
  readonly shadowOptions: CanvasShadowPreset[] = ['sm', 'md', 'lg', 'xl'];
  readonly visibleOptions: readonly ToggleGroupOption[] = [
    { label: 'Yes', value: true },
    { label: 'No', value: false },
  ];
  readonly wrapOptions: readonly ToggleGroupOption[] = [
    { label: 'Yes', value: true },
    { label: 'No', value: false },
  ];
  readonly layoutDirectionOptions: readonly ToggleGroupOption[] = [
    {
      label: '',
      value: 'row',
      icon: 'direction-horizontal',
      ariaLabel: 'Horizontal layout direction',
      title: 'Horizontal',
    },
    {
      label: '',
      value: 'column',
      icon: 'direction-vertical',
      ariaLabel: 'Vertical layout direction',
      title: 'Vertical',
    },
  ];
  readonly layoutDisplayOptions: readonly ToggleGroupOption[] = [
    { label: 'Flex', value: 'flex' },
    { label: 'Grid', value: 'grid' },
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
  readonly positionOptions: DropdownSelectOption[] = [
    { label: 'Static', value: 'static' },
    { label: 'Relative', value: 'relative' },
    { label: 'Absolute', value: 'absolute' },
    { label: 'Fixed', value: 'fixed' },
    { label: 'Sticky', value: 'sticky' },
  ];

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

  opacitySliderPercent(element: CanvasElement): string {
    const value = Number.isFinite(element.opacity ?? Number.NaN) ? (element.opacity as number) : 1;
    return `${Math.max(0, Math.min(100, Math.round(value * 100)))}%`;
  }

  onOverflowChange(event: Event): void {
    const overflow = (event.target as HTMLSelectElement).value as CanvasOverflowMode;
    this.emitPatch({ overflow });
  }

  onTypographySelectChange(
    field: EditableTypographyField,
    value: string | number | boolean | null,
  ): void {
    if (field === 'fontWeight') {
      if (typeof value !== 'number') {
        return;
      }

      this.emitPatch({ fontWeight: value });
      return;
    }

    if (typeof value !== 'string') {
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

  textVerticalAlignValue(element: CanvasElement): CanvasTextVerticalAlign {
    return element.textVerticalAlign ?? 'middle';
  }

  fillLabel(element: CanvasElement): string {
    const value = this.fillInputValue(element);
    return value === 'transparent' ? 'Transparent' : preserveColorDisplayValue(value);
  }

  borderSummary(element: CanvasElement): string {
    return this.borderStyleValue(element);
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

  supportsLayout(type: CanvasElementType): boolean {
    return type === 'frame' || type === 'rectangle';
  }

  hasLayout(element: CanvasElement): boolean {
    return !!element.display;
  }

  supportsPosition(type: CanvasElementType): boolean {
    return type !== 'frame';
  }

  isFlex(element: CanvasElement): boolean {
    return this.displayValue(element) === 'flex';
  }

  isGrid(element: CanvasElement): boolean {
    return this.displayValue(element) === 'grid';
  }

  displayValue(element: CanvasElement): 'flex' | 'grid' {
    return element.display === 'grid' ? 'grid' : 'flex';
  }

  positionValue(element: CanvasElement): CanvasPositionMode {
    return element.position ?? 'static';
  }

  flexDirectionValue(element: CanvasElement): 'row' | 'column' {
    return element.flexDirection === 'column' || element.flexDirection === 'column-reverse'
      ? 'column'
      : 'row';
  }

  flexWrapValue(element: CanvasElement): boolean {
    return element.flexWrap === 'wrap';
  }

  justifyContentValue(element: CanvasElement): CanvasJustifyContent {
    return element.justifyContent ?? 'flex-start';
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

  spacingValue(
    element: CanvasElement,
    type: 'padding' | 'margin',
    side: keyof CanvasSpacing,
  ): number {
    return element[type]?.[side] ?? 0;
  }

  addLayout(): void {
    this.emitPatch({ display: 'flex' });
  }

  removeLayout(): void {
    this.emitPatch({
      display: undefined,
      flexDirection: undefined,
      flexWrap: undefined,
      justifyContent: undefined,
      alignItems: undefined,
      gap: undefined,
      gridTemplateColumns: undefined,
      gridTemplateRows: undefined,
      padding: undefined,
    });
  }

  onDisplayChange(value: string | number | boolean): void {
    if (value !== 'flex' && value !== 'grid') {
      return;
    }

    this.emitPatch({ display: value as CanvasDisplayMode });
  }

  onPositionChange(value: string | number | boolean | null): void {
    if (typeof value !== 'string') {
      return;
    }

    this.emitPatch({
      position: value === 'static' ? undefined : (value as CanvasPositionMode),
    });
  }

  onFlexDirectionChange(value: string | number | boolean): void {
    if (value !== 'row' && value !== 'column') {
      return;
    }

    this.emitPatch({ flexDirection: value });
  }

  onFlexWrapToggle(wrap: boolean): void {
    this.emitPatch({ flexWrap: wrap ? 'wrap' : 'nowrap' } as Partial<CanvasElement>);
  }

  onJustifyContentChange(value: string | number | boolean | null): void {
    if (typeof value !== 'string') {
      return;
    }

    this.emitPatch({ justifyContent: value as CanvasJustifyContent });
  }

  onAlignItemsChange(value: string | number | boolean | null): void {
    if (typeof value !== 'string') {
      return;
    }

    this.emitPatch({ alignItems: value as CanvasAlignItems });
  }

  onTextMetricUnitChange(
    field: EditableTextMetricUnitField,
    value: string | number | boolean | null,
  ): void {
    const element = this.selectedElement;
    if (!element || typeof value !== 'string') {
      return;
    }

    if (field === 'fontSizeUnit') {
      if (value !== 'px' && value !== 'rem') {
        return;
      }

      const currentUnit = this.fontSizeUnitValue(element);
      if (currentUnit === value) {
        return;
      }

      const currentValue = element.fontSize ?? 16;
      const nextValue =
        currentUnit === 'px'
          ? roundToTwoDecimals(currentValue / 16)
          : roundToTwoDecimals(currentValue * 16);

      this.emitPatch({ fontSize: nextValue, fontSizeUnit: value });
      return;
    }

    if (value !== 'px' && value !== 'em') {
      return;
    }

    const currentValue = field === 'lineHeightUnit' ? (element.lineHeight ?? 1.2) : (element.letterSpacing ?? 0);
    const currentUnit =
      field === 'lineHeightUnit'
        ? this.lineHeightUnitValue(element)
        : this.letterSpacingUnitValue(element);

    if (currentUnit === value) {
      return;
    }

    const fontSizeInPixels = this.fontSizeInPixels(element);
    const nextValue =
      currentUnit === 'px'
        ? roundToTwoDecimals(currentValue / fontSizeInPixels)
        : roundToTwoDecimals(currentValue * fontSizeInPixels);

    this.emitPatch(
      field === 'lineHeightUnit'
        ? { lineHeight: nextValue, lineHeightUnit: value }
        : { letterSpacing: nextValue, letterSpacingUnit: value },
    );
  }

  onGridTemplateChange(field: 'gridTemplateColumns' | 'gridTemplateRows', event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.emitPatch({ [field]: value.trim() || undefined } as Partial<CanvasElement>);
  }

  onSpacingChange(type: 'padding' | 'margin', side: keyof CanvasSpacing, value: number): void {
    if (!Number.isFinite(value)) return;
    const element = this.selectedElement;
    if (!element) return;
    const current: CanvasSpacing = element[type] ?? { top: 0, right: 0, bottom: 0, left: 0 };
    this.emitPatch({ [type]: { ...current, [side]: value } } as Partial<CanvasElement>);
  }

  setFontStyle(style: CanvasFontStyle): void {
    this.emitPatch({ fontStyle: style });
  }

  setTextAlign(align: CanvasTextAlign): void {
    this.emitPatch({ textAlign: align });
  }

  onTextAlignChange(value: string | number | boolean | null): void {
    if (value === 'left' || value === 'center' || value === 'right' || value === 'justify') {
      this.setTextAlign(value);
    }
  }

  setTextVerticalAlign(align: CanvasTextVerticalAlign): void {
    this.emitPatch({ textVerticalAlign: align });
  }

  private emitPatch(patch: Partial<CanvasElement>): void {
    this.elementPatch.emit(patch);
  }

  private fontSizeInPixels(element: CanvasElement): number {
    const fontSize = element.fontSize ?? 16;
    return this.fontSizeUnitValue(element) === 'rem' ? fontSize * 16 : fontSize;
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
