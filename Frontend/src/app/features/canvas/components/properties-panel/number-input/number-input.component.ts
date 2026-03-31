import { CommonModule } from '@angular/common';
import {
  Component,
  EventEmitter,
  HostBinding,
  HostListener,
  Input,
  OnChanges,
  OnDestroy,
  Output,
  SimpleChanges,
} from '@angular/core';
import { roundToTwoDecimals } from '../../../utils/canvas-interaction.util';

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
  imports: [CommonModule],
  templateUrl: './number-input.component.html',
  styleUrl: './number-input.component.css',
})
export class NumberInputComponent implements OnChanges, OnDestroy {
  @Input() value: number | null = null;
  @Input() min?: number;
  @Input() max?: number;
  @Input() step = 1;
  @Input() appearance: NumberInputAppearance = 'default';
  @Input() ariaLabel = 'Numeric input';
  @Input() suffix: string | null = null;

  @Output() valueChange = new EventEmitter<number>();
  @Output() gestureStarted = new EventEmitter<void>();
  @Output() gestureCommitted = new EventEmitter<void>();

  @HostBinding('style.display') readonly hostDisplay = 'block';
  @HostBinding('style.min-width') readonly hostMinWidth = '0';

  @HostBinding('style.width')
  get hostWidth(): string {
    return this.appearance === 'compact'
      ? 'var(--number-input-compact-host-width, 72px)'
      : '100%';
  }

  @HostBinding('style.flex')
  get hostFlex(): string {
    return this.appearance === 'compact'
      ? 'var(--number-input-compact-host-flex, 0 0 72px)'
      : '1 1 auto';
  }

  @HostBinding('style.--number-input-value-length')
  get hostValueLength(): string {
    return `${Math.max(this.displayValue.length, 1)}`;
  }

  displayValue = '';
  private activeDrag: StepperDragState | null = null;

  get hasInlineSuffix(): boolean {
    return !!this.suffix && this.displayValue.length > 0;
  }

  ngOnChanges(changes: SimpleChanges): void {
    if ('value' in changes || 'step' in changes || 'min' in changes || 'max' in changes) {
      this.syncDisplayValue();
    }
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
      'number-input--boxed': this.appearance === 'boxed',
      'number-input--compact': this.appearance === 'compact',
      'number-input--popup': this.appearance === 'popup',
      'number-input--with-suffix': this.hasInlineSuffix,
    };
  }

  onInputChange(event: Event): void {
    const value = Number((event.target as HTMLInputElement).value);
    if (!Number.isFinite(value)) {
      return;
    }

    this.commitValue(value);
  }

  onStepperPointerDown(direction: 1 | -1, event: PointerEvent): void {
    event.preventDefault();
    event.stopPropagation();

    const currentValue = this.value ?? 0;
    this.gestureStarted.emit();
    this.activeDrag = {
      startY: event.clientY,
      startValue: currentValue,
      initialDirection: direction,
    };

    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'ns-resize';
    this.commitValue(currentValue + direction * this.step);
  }

  @HostListener('document:pointermove', ['$event'])
  onDocumentPointerMove(event: PointerEvent): void {
    if (!this.activeDrag) {
      return;
    }

    event.preventDefault();
    const dragDelta = Math.trunc((this.activeDrag.startY - event.clientY) / DRAG_PIXELS_PER_STEP);
    const nextValue =
      this.activeDrag.startValue + (this.activeDrag.initialDirection + dragDelta) * this.step;
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
    if (!Number.isFinite(this.value ?? Number.NaN)) {
      this.displayValue = '';
      return;
    }

    const normalized = this.normalizeValue(this.value as number);
    this.displayValue = this.formatValue(normalized);
  }

  private commitValue(rawValue: number): void {
    const normalized = this.normalizeValue(rawValue);
    this.displayValue = this.formatValue(normalized);
    this.valueChange.emit(normalized);
  }

  private normalizeValue(value: number): number {
    let nextValue = roundToTwoDecimals(value);

    if (this.min !== undefined) {
      nextValue = Math.max(this.min, nextValue);
    }

    if (this.max !== undefined) {
      nextValue = Math.min(this.max, nextValue);
    }

    if (this.step >= 1) {
      return Math.round(nextValue);
    }

    const precision = this.decimalPrecision();
    const steppedValue = Math.round(nextValue / this.step) * this.step;
    return Number(steppedValue.toFixed(precision));
  }

  private formatValue(value: number): string {
    return this.step >= 1 ? Math.round(value).toString() : value.toFixed(this.decimalPrecision());
  }

  private decimalPrecision(): number {
    const stepText = this.step.toString();
    const decimalSeparatorIndex = stepText.indexOf('.');
    return decimalSeparatorIndex === -1 ? 0 : stepText.length - decimalSeparatorIndex - 1;
  }
}
