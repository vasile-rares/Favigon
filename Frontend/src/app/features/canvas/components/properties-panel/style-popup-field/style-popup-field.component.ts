import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  Component,
  ElementRef,
  EventEmitter,
  HostBinding,
  HostListener,
  Input,
  OnChanges,
  OnDestroy,
  Output,
  SimpleChanges,
} from '@angular/core';
import { CanvasElement, CanvasShadowPreset } from '../../../../../core/models/canvas.models';
import { roundToTwoDecimals } from '../../../utils/canvas-interaction.util';
import {
  DropdownSelectComponent,
  DropdownSelectOption,
} from '../../../../../shared/components/dropdown-select/dropdown-select.component';
import { NumberInputComponent } from '../number-input/number-input.component';
import { StylePopupOverlayComponent } from '../style-popup-overlay/style-popup-overlay.component';

type StylePopupFieldKind = 'fill' | 'stroke' | 'shadow';
type ColorPickerDragTarget = 'surface' | 'hue' | 'alpha' | null;

@Component({
  selector: 'app-style-popup-field',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    NumberInputComponent,
    StylePopupOverlayComponent,
    DropdownSelectComponent,
  ],
  templateUrl: './style-popup-field.component.html',
  styleUrl: './style-popup-field.component.css',
})
export class StylePopupFieldComponent implements OnChanges, OnDestroy {
  @Input() kind: StylePopupFieldKind = 'fill';
  @Input() hasValue = true;
  @Input() triggerText = '';
  @Input() swatchColor: string | null = null;
  @Input() isTransparent = false;
  @Input() shadowPreview: CanvasShadowPreset | 'none' = 'none';
  @Input() colorValue = '#000000';
  @Input() pickerColor = '#000000';
  @Input() strokeWidth = 1;
  @Input() strokeStyle = 'Solid';
  @Input() borderStyleOptions: string[] = [];
  @Input() shadowOptions: CanvasShadowPreset[] = ['sm', 'md', 'lg', 'xl'];
  @Input() activationPatch: Partial<CanvasElement> | null = null;
  @Input() clearPatch: Partial<CanvasElement> | null = null;

  @Output() patchRequested = new EventEmitter<Partial<CanvasElement>>();
  @Output() numberGestureStarted = new EventEmitter<void>();
  @Output() numberGestureCommitted = new EventEmitter<void>();

  @HostBinding('style.display') readonly hostDisplay = 'block';
  @HostBinding('style.width') readonly hostWidth = '100%';
  @HostBinding('style.min-width') readonly hostMinWidth = '0';

  isOpen = false;
  popupTop: number | null = 16;
  popupBottom: number | null = null;
  popupLeft = 16;
  popupWidth = 248;
  pickerHue = 0;
  pickerSaturation = 0;
  pickerValue = 0;
  pickerAlpha = 1;
  selectedStrokeStyleOption: string | null = null;

  private colorPickerDragTarget: ColorPickerDragTarget = null;
  private activePopupAnchor: HTMLElement | null = null;
  private isColorGestureActive = false;
  private readonly onGlobalScroll = (): void => {
    if (!this.isOpen || !this.activePopupAnchor) {
      return;
    }

    this.updatePopupPlacement(this.activePopupAnchor);
  };

  constructor(private readonly hostRef: ElementRef<HTMLElement>) {
    window.addEventListener('scroll', this.onGlobalScroll, true);
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (
      (changes['pickerColor'] || changes['colorValue'] || changes['isTransparent']) &&
      this.isColorKind() &&
      this.isOpen &&
      !this.colorPickerDragTarget
    ) {
      this.syncPickerFromColor(this.getInitialPickerColor());
    }

    if (changes['strokeStyle']) {
      this.selectedStrokeStyleOption = this.strokeStyle;
    }
  }

  ngOnDestroy(): void {
    window.removeEventListener('scroll', this.onGlobalScroll, true);
    document.body.style.userSelect = '';
    document.body.style.cursor = '';
  }

  get popupTitle(): string {
    switch (this.kind) {
      case 'fill':
        return 'Fill';
      case 'stroke':
        return 'Border';
      case 'shadow':
        return 'Shadows';
      default:
        return '';
    }
  }

  get showAddButton(): boolean {
    return this.kind !== 'fill' && !this.hasValue;
  }

  get showClearButton(): boolean {
    return this.kind === 'fill' || this.hasValue;
  }

  get clearButtonTitle(): string {
    switch (this.kind) {
      case 'fill':
        return 'Clear fill';
      case 'stroke':
        return 'Remove stroke';
      case 'shadow':
        return 'Remove shadow';
      default:
        return 'Clear';
    }
  }

  @HostListener('document:pointerdown', ['$event'])
  onDocumentPointerDown(event: PointerEvent): void {
    if (!this.isOpen) {
      return;
    }

    if (!this.hostRef.nativeElement.contains(event.target as Node)) {
      this.closePopup();
    }
  }

  @HostListener('document:keydown.escape')
  onEscapePressed(): void {
    this.closePopup();
  }

  @HostListener('window:resize')
  onWindowResize(): void {
    if (!this.isOpen || !this.activePopupAnchor) {
      return;
    }

    this.updatePopupPlacement(this.activePopupAnchor);
  }

  @HostListener('document:pointermove', ['$event'])
  onDocumentPointerMove(event: PointerEvent): void {
    if (!this.colorPickerDragTarget) {
      return;
    }

    event.preventDefault();
    if (this.colorPickerDragTarget === 'surface') {
      this.updateColorFromSurfaceCoordinates(event.clientX, event.clientY);
      return;
    }

    if (this.colorPickerDragTarget === 'alpha') {
      this.updateColorFromAlphaCoordinates(event.clientX);
      return;
    }

    this.updateColorFromHueCoordinates(event.clientX);
  }

  @HostListener('document:pointerup')
  onDocumentPointerUp(): void {
    const hadActiveColorGesture = !!this.colorPickerDragTarget;
    this.colorPickerDragTarget = null;
    document.body.style.userSelect = '';
    document.body.style.cursor = '';

    if (hadActiveColorGesture && this.isColorGestureActive) {
      this.isColorGestureActive = false;
      this.numberGestureCommitted.emit();
    }
  }

  onTriggerClick(event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();

    if (this.isOpen) {
      this.closePopup();
      return;
    }

    if (!this.hasValue && this.activationPatch) {
      this.patchRequested.emit(this.activationPatch);
    }

    if (this.isColorKind()) {
      this.syncPickerFromColor(this.getInitialPickerColor());
    }

    this.activePopupAnchor = event.currentTarget as HTMLElement;
    this.updatePopupPlacement(this.activePopupAnchor);
    this.isOpen = true;
  }

  onClearClick(event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();

    if (this.clearPatch) {
      this.patchRequested.emit(this.clearPatch);
    }

    if (this.kind !== 'fill') {
      this.closePopup();
    }
  }

  onPopupCloseClick(): void {
    this.closePopup();
  }

  onColorTextChange(event: Event): void {
    if (!this.isColorKind()) {
      return;
    }

    const input = event.target as HTMLInputElement;
    const normalized = input.value.trim();
    const parsed = parseCssColor(normalized);

    if (!parsed) {
      input.value = this.pickerColorValue();
      return;
    }

    this.syncPickerFromColor(normalized);
    this.patchRequested.emit(
      this.kind === 'fill'
        ? { fill: this.pickerColorValue() }
        : { stroke: this.pickerColorValue() },
    );
  }

  onColorSurfacePointerDown(event: PointerEvent): void {
    if (!this.isColorKind()) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    this.beginColorGesture();
    this.colorPickerDragTarget = 'surface';
    document.body.style.userSelect = 'none';
    this.updateColorFromSurfaceCoordinates(event.clientX, event.clientY);
  }

  onHueSliderPointerDown(event: PointerEvent): void {
    if (!this.isColorKind()) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    this.beginColorGesture();
    this.colorPickerDragTarget = 'hue';
    document.body.style.userSelect = 'none';
    this.updateColorFromHueCoordinates(event.clientX);
  }

  onAlphaSliderPointerDown(event: PointerEvent): void {
    if (!this.isColorKind()) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    this.beginColorGesture();
    this.colorPickerDragTarget = 'alpha';
    document.body.style.userSelect = 'none';
    this.updateColorFromAlphaCoordinates(event.clientX);
  }

  onStrokeWidthChange(value: number): void {
    this.patchRequested.emit({ strokeWidth: value });
  }

  onStrokeStyleValueChange(value: string | number | boolean | null): void {
    if (typeof value !== 'string') {
      return;
    }

    this.selectedStrokeStyleOption = value;
    this.patchRequested.emit({ strokeStyle: value });
  }

  onShadowSelected(value: CanvasShadowPreset): void {
    this.patchRequested.emit({ shadow: value });
  }

  onNumberGestureStarted(): void {
    this.numberGestureStarted.emit();
  }

  onNumberGestureCommitted(): void {
    this.numberGestureCommitted.emit();
  }

  pickerHueColor(): string {
    const { r, g, b } = hsvToRgb(this.pickerHue, 1, 1);
    return rgbToHex(r, g, b);
  }

  pickerHex(): string {
    const { r, g, b } = hsvToRgb(this.pickerHue, this.pickerSaturation, this.pickerValue);
    return rgbToHex(r, g, b).toUpperCase();
  }

  pickerColorValue(): string {
    const { r, g, b } = hsvToRgb(this.pickerHue, this.pickerSaturation, this.pickerValue);
    if (this.pickerAlpha >= 0.999) {
      return rgbToHex(r, g, b).toUpperCase();
    }

    return toRgbaString(r, g, b, this.pickerAlpha);
  }

  pickerSaturationPercent(): number {
    return this.pickerSaturation * 100;
  }

  pickerValuePercent(): number {
    return (1 - this.pickerValue) * 100;
  }

  pickerHuePercent(): number {
    return (this.pickerHue / 360) * 100;
  }

  pickerAlphaPercent(): number {
    return this.pickerAlpha * 100;
  }

  get strokeStyleDropdownOptions(): DropdownSelectOption[] {
    return this.borderStyleOptions.map((option) => ({ label: option, value: option }));
  }

  alphaTrackBackground(): string {
    const { r, g, b } = hsvToRgb(this.pickerHue, this.pickerSaturation, this.pickerValue);
    return `linear-gradient(90deg, rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, 0) 0%, rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, 1) 100%)`;
  }

  private isColorKind(): boolean {
    return this.kind === 'fill' || this.kind === 'stroke';
  }

  private beginColorGesture(): void {
    if (this.isColorGestureActive) {
      return;
    }

    this.isColorGestureActive = true;
    this.numberGestureStarted.emit();
  }

  private closePopup(): void {
    if (this.isColorGestureActive) {
      this.isColorGestureActive = false;
      this.numberGestureCommitted.emit();
    }

    this.isOpen = false;
    this.colorPickerDragTarget = null;
    this.activePopupAnchor = null;
    document.body.style.userSelect = '';
    document.body.style.cursor = '';
  }

  private getInitialPickerColor(): string {
    if (this.pickerColor) {
      return this.pickerColor;
    }

    if (this.kind === 'fill' && this.isTransparent) {
      return '#E0E0E0';
    }

    return this.colorValue;
  }

  private updateColorFromSurfaceCoordinates(clientX: number, clientY: number): void {
    const target = this.hostRef.nativeElement.querySelector(
      '.spf-color-picker__surface',
    ) as HTMLElement | null;
    if (!target) {
      return;
    }

    const rect = target.getBoundingClientRect();
    this.pickerSaturation = clamp01((clientX - rect.left) / Math.max(rect.width, 1));
    this.pickerValue = 1 - clamp01((clientY - rect.top) / Math.max(rect.height, 1));
    this.commitPickerColor();
  }

  private updateColorFromHueCoordinates(clientX: number): void {
    const target = this.hostRef.nativeElement.querySelector(
      '.spf-color-picker__hue-track',
    ) as HTMLElement | null;
    if (!target) {
      return;
    }

    const rect = target.getBoundingClientRect();
    const ratio = clamp01((clientX - rect.left) / Math.max(rect.width, 1));
    this.pickerHue = roundToTwoDecimals(ratio * 360);
    this.commitPickerColor();
  }

  private updateColorFromAlphaCoordinates(clientX: number): void {
    const target = this.hostRef.nativeElement.querySelector(
      '.spf-color-picker__alpha-track',
    ) as HTMLElement | null;
    if (!target) {
      return;
    }

    const rect = target.getBoundingClientRect();
    const ratio = clamp01((clientX - rect.left) / Math.max(rect.width, 1));
    this.pickerAlpha = roundToTwoDecimals(ratio);
    this.commitPickerColor();
  }

  private commitPickerColor(): void {
    const colorValue = this.pickerColorValue();
    this.patchRequested.emit(this.kind === 'fill' ? { fill: colorValue } : { stroke: colorValue });
  }

  private syncPickerFromColor(color: string): void {
    const parsed = parseCssColor(color) ?? { r: 224, g: 224, b: 224, a: 1 };
    const { r, g, b } = parsed;
    const { h, s, v } = rgbToHsv(r, g, b);
    this.pickerHue = h;
    this.pickerSaturation = s;
    this.pickerValue = v;
    this.pickerAlpha = parsed.a;
  }

  private updatePopupPlacement(anchor: HTMLElement): void {
    const panelElement = this.hostRef.nativeElement.closest(
      '.properties-panel',
    ) as HTMLElement | null;
    const panelBounds = (panelElement ?? this.hostRef.nativeElement).getBoundingClientRect();
    this.popupTop = null;
    this.popupBottom = 12;

    this.popupWidth = Math.min(248, Math.max(220, window.innerWidth - 24));
    const desiredLeft = panelBounds.left - this.popupWidth - 12;
    const maxLeft = Math.max(12, window.innerWidth - this.popupWidth - 12);
    this.popupLeft = Math.min(maxLeft, Math.max(12, desiredLeft));
  }
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function parseCssColor(color: string): { r: number; g: number; b: number; a: number } | null {
  const normalized = color.trim();
  if (!normalized) {
    return null;
  }

  if (normalized.toLowerCase() === 'transparent') {
    return { r: 224, g: 224, b: 224, a: 0 };
  }

  const hexMatch = normalized.match(/^#([A-Fa-f0-9]{3,4}|[A-Fa-f0-9]{6}|[A-Fa-f0-9]{8})$/);
  if (hexMatch) {
    const expanded = expandHex(hexMatch[1]);
    const parsed = Number.parseInt(expanded, 16);
    if (expanded.length === 6) {
      return {
        r: (parsed >> 16) & 255,
        g: (parsed >> 8) & 255,
        b: parsed & 255,
        a: 1,
      };
    }

    return {
      r: (parsed >> 24) & 255,
      g: (parsed >> 16) & 255,
      b: (parsed >> 8) & 255,
      a: roundToTwoDecimals((parsed & 255) / 255),
    };
  }

  const rgbMatch = normalized.match(
    /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})(?:\s*,\s*(\d*\.?\d+))?\s*\)$/i,
  );
  if (!rgbMatch) {
    return null;
  }

  const red = Number(rgbMatch[1]);
  const green = Number(rgbMatch[2]);
  const blue = Number(rgbMatch[3]);
  const alpha = rgbMatch[4] === undefined ? 1 : Number(rgbMatch[4]);
  if ([red, green, blue].some((channel) => Number.isNaN(channel) || channel < 0 || channel > 255)) {
    return null;
  }

  if (Number.isNaN(alpha) || alpha < 0 || alpha > 1) {
    return null;
  }

  return {
    r: red,
    g: green,
    b: blue,
    a: roundToTwoDecimals(alpha),
  };
}

function expandHex(hex: string): string {
  if (hex.length === 3 || hex.length === 4) {
    return hex
      .split('')
      .map((char) => `${char}${char}`)
      .join('');
  }

  return hex;
}

function rgbToHex(r: number, g: number, b: number): string {
  return `#${[r, g, b]
    .map((channel) => Math.round(channel).toString(16).padStart(2, '0'))
    .join('')}`;
}

function toRgbaString(r: number, g: number, b: number, a: number): string {
  const alpha = Number(roundToTwoDecimals(a).toFixed(2).replace(/0+$/, '').replace(/\.$/, ''));
  return `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, ${alpha})`;
}

function rgbToHsv(r: number, g: number, b: number): { h: number; s: number; v: number } {
  const red = r / 255;
  const green = g / 255;
  const blue = b / 255;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const delta = max - min;

  let h = 0;
  if (delta !== 0) {
    if (max === red) {
      h = 60 * (((green - blue) / delta) % 6);
    } else if (max === green) {
      h = 60 * ((blue - red) / delta + 2);
    } else {
      h = 60 * ((red - green) / delta + 4);
    }
  }

  if (h < 0) {
    h += 360;
  }

  return {
    h,
    s: max === 0 ? 0 : delta / max,
    v: max,
  };
}

function hsvToRgb(h: number, s: number, v: number): { r: number; g: number; b: number } {
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;

  let red = 0;
  let green = 0;
  let blue = 0;

  if (h < 60) {
    red = c;
    green = x;
  } else if (h < 120) {
    red = x;
    green = c;
  } else if (h < 180) {
    green = c;
    blue = x;
  } else if (h < 240) {
    green = x;
    blue = c;
  } else if (h < 300) {
    red = x;
    blue = c;
  } else {
    red = c;
    blue = x;
  }

  return {
    r: (red + m) * 255,
    g: (green + m) * 255,
    b: (blue + m) * 255,
  };
}
