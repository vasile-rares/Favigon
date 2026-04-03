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
import {
  ToggleGroupComponent,
  ToggleGroupOption,
  ToggleGroupValue,
} from '../../../../../shared/components/toggle-group/toggle-group.component';
import { NumberInputComponent } from '../number-input/number-input.component';
import { StylePopupOverlayComponent } from '../style-popup-overlay/style-popup-overlay.component';

type StylePopupFieldKind = 'fill' | 'stroke' | 'shadow';
type ColorPickerDragTarget = 'surface' | 'hue' | 'alpha' | null;
type ColorPickerFormat = 'hex' | 'rgb' | 'hsl';
type ColorPickerMode = 'solid' | 'linear' | 'radial' | 'conic' | 'image';
type EyeDropperResult = { sRGBHex: string };
type EyeDropperInstance = { open(): Promise<EyeDropperResult> };
type EyeDropperConstructor = new () => EyeDropperInstance;

@Component({
  selector: 'app-style-popup-field',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    NumberInputComponent,
    StylePopupOverlayComponent,
    DropdownSelectComponent,
    ToggleGroupComponent,
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
  selectedColorFormat: ColorPickerFormat = 'hex';
  selectedColorMode: ColorPickerMode = 'solid';
  isScreenPickerActive = false;
  readonly colorFormatOptions: DropdownSelectOption[] = [
    { label: 'HEX', value: 'hex' },
    { label: 'RGB', value: 'rgb' },
    { label: 'HSL', value: 'hsl' },
  ];
  readonly colorModeOptions: readonly ToggleGroupOption[] = [
    { label: '', value: 'solid', icon: 'paint-solid', ariaLabel: 'Solid', title: 'Solid' },
    { label: '', value: 'linear', icon: 'paint-linear', ariaLabel: 'Linear', title: 'Linear' },
    { label: '', value: 'radial', icon: 'paint-radial', ariaLabel: 'Radial', title: 'Radial' },
    { label: '', value: 'conic', icon: 'paint-conic', ariaLabel: 'Conic', title: 'Conic' },
    { label: '', value: 'image', icon: 'paint-image', ariaLabel: 'Image', title: 'Image' },
  ];

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
      const initialColor = this.getInitialPickerColor();
      this.syncPickerFromColor(initialColor);
      this.selectedColorFormat =
        inferCssColorFormat(
          this.kind === 'fill' && this.isTransparent ? initialColor : this.colorValue,
        ) ??
        inferCssColorFormat(initialColor) ??
        this.selectedColorFormat;
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

  onColorFormatValueChange(value: string | number | boolean | null): void {
    if (!this.isColorKind() || typeof value !== 'string' || !isColorPickerFormat(value)) {
      return;
    }

    this.selectedColorFormat = value;
    if (this.kind === 'fill' && this.isTransparent) {
      return;
    }

    this.commitPickerColor();
  }

  onColorModeValueChange(value: ToggleGroupValue): void {
    if (typeof value !== 'string' || !isColorPickerMode(value)) {
      return;
    }

    this.selectedColorMode = value;
  }

  async onScreenPickerClick(): Promise<void> {
    if (!this.isColorKind() || this.isScreenPickerActive) {
      return;
    }

    const EyeDropperApi = getEyeDropperConstructor();
    if (!EyeDropperApi) {
      return;
    }

    this.isScreenPickerActive = true;

    try {
      const result = await new EyeDropperApi().open();
      if (!result.sRGBHex) {
        return;
      }

      this.syncPickerFromColor(result.sRGBHex);
      this.commitPickerColor();
    } catch (error) {
      if (!isEyeDropperAbortError(error)) {
        return;
      }
    } finally {
      this.isScreenPickerActive = false;
    }
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
    switch (this.selectedColorFormat) {
      case 'rgb':
        return toRgbString(r, g, b, this.pickerAlpha);
      case 'hsl': {
        const { h, s, l } = rgbToHsl(r, g, b);
        return toHslString(h, s, l, this.pickerAlpha);
      }
      case 'hex':
      default:
        return rgbToHex(r, g, b, this.pickerAlpha).toUpperCase();
    }
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

  get isScreenPickerSupported(): boolean {
    return getEyeDropperConstructor() !== null;
  }

  get screenPickerButtonLabel(): string {
    if (this.isScreenPickerActive) {
      return 'Picking...';
    }

    return this.isScreenPickerSupported ? 'Pick From Screen' : 'Screen Picker Unavailable';
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
      '.style-popup-field__color-picker-surface',
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
      '.style-popup-field__color-picker-hue-track',
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
      '.style-popup-field__color-picker-alpha-track',
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
  if (rgbMatch) {
    const red = Number(rgbMatch[1]);
    const green = Number(rgbMatch[2]);
    const blue = Number(rgbMatch[3]);
    const alpha = rgbMatch[4] === undefined ? 1 : Number(rgbMatch[4]);
    if (
      [red, green, blue].some((channel) => Number.isNaN(channel) || channel < 0 || channel > 255)
    ) {
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

  const hslMatch = normalized.match(
    /^hsla?\(\s*([+-]?\d*\.?\d+)\s*(?:deg)?\s*,\s*(\d*\.?\d+)%\s*,\s*(\d*\.?\d+)%(?:\s*,\s*(\d*\.?\d+))?\s*\)$/i,
  );
  if (!hslMatch) {
    return null;
  }

  const hue = Number(hslMatch[1]);
  const saturation = Number(hslMatch[2]);
  const lightness = Number(hslMatch[3]);
  const alpha = hslMatch[4] === undefined ? 1 : Number(hslMatch[4]);
  if (
    [hue, saturation, lightness].some((channel) => Number.isNaN(channel)) ||
    saturation < 0 ||
    saturation > 100 ||
    lightness < 0 ||
    lightness > 100
  ) {
    return null;
  }

  if (Number.isNaN(alpha) || alpha < 0 || alpha > 1) {
    return null;
  }

  const { r, g, b } = hslToRgb(hue, saturation / 100, lightness / 100);

  return {
    r,
    g,
    b,
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

function rgbToHex(r: number, g: number, b: number, a = 1): string {
  const channels = [r, g, b];
  if (a < 0.999) {
    channels.push(a * 255);
  }

  return `#${channels
    .map((channel) => Math.round(channel).toString(16).padStart(2, '0'))
    .join('')}`;
}

function toRgbString(r: number, g: number, b: number, a: number): string {
  const red = Math.round(r);
  const green = Math.round(g);
  const blue = Math.round(b);
  if (a >= 0.999) {
    return `rgb(${red}, ${green}, ${blue})`;
  }

  return `rgba(${red}, ${green}, ${blue}, ${formatCssNumber(a)})`;
}

function toHslString(h: number, s: number, l: number, a: number): string {
  const hue = formatCssNumber(normalizeHue(h));
  const saturation = formatCssNumber(s * 100);
  const lightness = formatCssNumber(l * 100);
  if (a >= 0.999) {
    return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
  }

  return `hsla(${hue}, ${saturation}%, ${lightness}%, ${formatCssNumber(a)})`;
}

function formatCssNumber(value: number): string {
  return roundToTwoDecimals(value).toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
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

function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
  const red = r / 255;
  const green = g / 255;
  const blue = b / 255;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const delta = max - min;
  const lightness = (max + min) / 2;

  if (delta === 0) {
    return { h: 0, s: 0, l: lightness };
  }

  let hue = 0;
  if (max === red) {
    hue = ((green - blue) / delta) % 6;
  } else if (max === green) {
    hue = (blue - red) / delta + 2;
  } else {
    hue = (red - green) / delta + 4;
  }

  hue *= 60;
  if (hue < 0) {
    hue += 360;
  }

  const saturation = delta / (1 - Math.abs(2 * lightness - 1));
  return { h: hue, s: saturation, l: lightness };
}

function hslToRgb(h: number, s: number, l: number): { r: number; g: number; b: number } {
  const hue = normalizeHue(h);
  const chroma = (1 - Math.abs(2 * l - 1)) * s;
  const intermediate = chroma * (1 - Math.abs(((hue / 60) % 2) - 1));
  const match = l - chroma / 2;

  let red = 0;
  let green = 0;
  let blue = 0;

  if (hue < 60) {
    red = chroma;
    green = intermediate;
  } else if (hue < 120) {
    red = intermediate;
    green = chroma;
  } else if (hue < 180) {
    green = chroma;
    blue = intermediate;
  } else if (hue < 240) {
    green = intermediate;
    blue = chroma;
  } else if (hue < 300) {
    red = intermediate;
    blue = chroma;
  } else {
    red = chroma;
    blue = intermediate;
  }

  return {
    r: (red + match) * 255,
    g: (green + match) * 255,
    b: (blue + match) * 255,
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

function normalizeHue(value: number): number {
  const hue = value % 360;
  return hue < 0 ? hue + 360 : hue;
}

function inferCssColorFormat(value: string | null | undefined): ColorPickerFormat | null {
  const normalized = value?.trim();
  if (!normalized) {
    return null;
  }

  if (normalized.startsWith('#')) {
    return 'hex';
  }

  if (/^rgba?\(/i.test(normalized)) {
    return 'rgb';
  }

  if (/^hsla?\(/i.test(normalized)) {
    return 'hsl';
  }

  return null;
}

function isColorPickerFormat(value: string): value is ColorPickerFormat {
  return value === 'hex' || value === 'rgb' || value === 'hsl';
}

function isColorPickerMode(value: string): value is ColorPickerMode {
  return (
    value === 'solid' ||
    value === 'linear' ||
    value === 'radial' ||
    value === 'conic' ||
    value === 'image'
  );
}

function getEyeDropperConstructor(): EyeDropperConstructor | null {
  if (typeof window === 'undefined') {
    return null;
  }

  const eyeDropperApi = (window as Window & { EyeDropper?: EyeDropperConstructor }).EyeDropper;
  return eyeDropperApi ?? null;
}

function isEyeDropperAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}
