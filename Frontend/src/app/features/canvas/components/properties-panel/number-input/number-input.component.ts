import { NgClass } from '@angular/common';
import {
  Component,
  effect,
  HostBinding,
  HostListener,
  input,
  OnDestroy,
  output,
} from '@angular/core';
import { roundToTwoDecimals } from '../../../utils/canvas-math.util';

type NumberInputAppearance = 'default' | 'boxed' | 'compact' | 'popup';

interface StepperDragState {
  startY: number;
  startValue: number;
  initialDirection: 1 | -1;
}

const DRAG_PIXELS_PER_STEP = 4;

@Component({
  selector: 'app-number-input',
  standalone: true,
  imports: [NgClass],
  templateUrl: './number-input.component.html',
  styleUrl: './number-input.component.css',
})
export class NumberInputComponent implements OnDestroy {
  readonly value = input<number | null>(null);
  readonly min = input<number | undefined>(undefined);
  readonly max = input<number | undefined>(undefined);
  readonly step = input(1);
  readonly appearance = input<NumberInputAppearance>('default');
  readonly ariaLabel = input('Numeric input');
  readonly suffix = input<string | null>(null);
  readonly suffixMode = input<'inline' | 'stepper'>('inline');
  readonly disabled = input(false);

  readonly valueChange = output<number>();
  readonly gestureStarted = output<void>();
  readonly gestureCommitted = output<void>();

  @HostBinding('style.display') readonly hostDisplay = 'block';
  @HostBinding('style.min-width') readonly hostMinWidth = '0';

  @HostBinding('style.width')
  get hostWidth(): string {
    return this.appearance() === 'compact'
      ? 'var(--number-input-compact-host-width, 72px)'
      : '100%';
  }

  @HostBinding('style.flex')
  get hostFlex(): string {
    return this.appearance() === 'compact'
      ? 'var(--number-input-compact-host-flex, 0 0 72px)'
      : '1 1 auto';
  }

  @HostBinding('style.--number-input-value-length')
  get hostValueLength(): string {
    return `${Math.max(this.displayValue.length, 1)}`;
  }

  displayValue = '';
  private activeDrag: StepperDragState | null = null;

  constructor() {
    effect(() => {
      this.value();
      this.step();
      this.min();
      this.max();
      this.syncDisplayValue();
    });
  }

  get hasInlineSuffix(): boolean {
    return this.suffixMode() === 'inline' && !!this.suffix() && this.displayValue.length > 0;
  }

  get hasStepperSuffix(): boolean {
    return this.suffixMode() === 'stepper' && !!this.suffix();
  }

  ngOnDestroy(): void {
    if (!this.activeDrag) {
      return;
    }

    document.body.style.userSelect = '';
    document.body.style.cursor = '';
  }

  get rootClassNames(): Record<string, boolean> {
    return {
      'number-input': true,
      'number-input--boxed': this.appearance() === 'boxed',
      'number-input--compact': this.appearance() === 'compact',
      'number-input--popup': this.appearance() === 'popup',
      'number-input--with-suffix': this.hasInlineSuffix,
      'number-input--with-stepper-suffix': this.hasStepperSuffix,
    };
  }

  onInputChange(event: Event): void {
    if (this.disabled()) {
      return;
    }

    const value = Number((event.target as HTMLInputElement).value);
    if (!Number.isFinite(value)) {
      return;
    }

    this.commitValue(value);
  }

  onStepperPointerDown(direction: 1 | -1, event: PointerEvent): void {
    if (this.disabled()) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const currentValue = this.value() ?? 0;
    this.gestureStarted.emit();
    this.activeDrag = {
      startY: event.clientY,
      startValue: currentValue,
      initialDirection: direction,
    };

    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'ns-resize';
    this.commitValue(currentValue + direction * this.step());
  }

  @HostListener('document:pointermove', ['$event'])
  onDocumentPointerMove(event: PointerEvent): void {
    if (!this.activeDrag) {
      return;
    }

    event.preventDefault();
    const dragDelta = Math.trunc((this.activeDrag.startY - event.clientY) / DRAG_PIXELS_PER_STEP);
    const nextValue =
      this.activeDrag.startValue + (this.activeDrag.initialDirection + dragDelta) * this.step();
    this.commitValue(nextValue);
  }

  @HostListener('document:pointerup')
  onDocumentPointerUp(): void {
    const hadActiveDrag = !!this.activeDrag;
    this.activeDrag = null;
    document.body.style.userSelect = '';
    document.body.style.cursor = '';

    if (hadActiveDrag) {
      this.gestureCommitted.emit();
    }
  }

  private syncDisplayValue(): void {
    if (!Number.isFinite(this.value() ?? Number.NaN)) {
      this.displayValue = '';
      return;
    }

    const normalized = this.normalizeValue(this.value() as number);
    this.displayValue = this.formatValue(normalized);
  }

  private commitValue(rawValue: number): void {
    const normalized = this.normalizeValue(rawValue);
    this.displayValue = this.formatValue(normalized);
    this.valueChange.emit(normalized);
  }

  private normalizeValue(value: number): number {
    let nextValue = roundToTwoDecimals(value);

    if (this.min() !== undefined) {
      nextValue = Math.max(this.min() as number, nextValue);
    }

    if (this.max() !== undefined) {
      nextValue = Math.min(this.max() as number, nextValue);
    }

    if (this.step() >= 1) {
      return Math.round(nextValue);
    }

    const precision = this.decimalPrecision();
    const steppedValue = Math.round(nextValue / this.step()) * this.step();
    return Number(steppedValue.toFixed(precision));
  }

  private formatValue(value: number): string {
    return this.step() >= 1 ? Math.round(value).toString() : value.toFixed(this.decimalPrecision());
  }

  private decimalPrecision(): number {
    const stepText = this.step().toString();
    const decimalSeparatorIndex = stepText.indexOf('.');
    return decimalSeparatorIndex === -1 ? 0 : stepText.length - decimalSeparatorIndex - 1;
  }
}
