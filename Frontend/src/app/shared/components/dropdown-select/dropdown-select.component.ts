import { Component, ElementRef, HostListener, Optional, Self, input } from '@angular/core';
import { ControlValueAccessor, FormsModule, NgControl } from '@angular/forms';
import { TextInputComponent } from '../text-input/text-input.component';

export interface DropdownSelectOption {
  label: string;
  triggerLabel?: string;
  value: string | number | boolean;
  disabled?: boolean;
}

@Component({
  selector: 'app-dropdown-select',
  standalone: true,
  imports: [FormsModule, TextInputComponent],
  templateUrl: './dropdown-select.component.html',
  styleUrl: './dropdown-select.component.css',
})
export class DropdownSelectComponent implements ControlValueAccessor {
  readonly id = input<string | undefined>(undefined);
  readonly label = input('');
  readonly placeholder = input('Select an option');
  readonly requiredMarker = input(false);
  readonly emptyText = input('No items found.');
  readonly enableSearch = input(true);
  readonly options = input<DropdownSelectOption[]>([]);
  readonly closeOnSelect = input(true);
  readonly outsideClickBoundarySelector = input('');
  disabled = false;

  isOpen = false;
  isClosing = false;
  openDirection: 'below' | 'above' = 'below';
  openAlignment: 'start' | 'end' = 'start';
  searchQuery = '';
  selectedValue: string | number | boolean | null = null;

  private readonly panelAnimationMs = 140;
  private closeTimeoutId: ReturnType<typeof setTimeout> | null = null;

  private onChange: (value: string | number | boolean | null) => void = () => undefined;
  private onTouched: () => void = () => undefined;

  constructor(
    private readonly hostRef: ElementRef<HTMLElement>,
    @Optional() @Self() private readonly ngControl: NgControl,
  ) {
    if (this.ngControl) {
      this.ngControl.valueAccessor = this;
    }
  }

  get isInvalid(): boolean {
    const control = this.ngControl?.control;
    return !!control && control.invalid && (control.dirty || control.touched);
  }

  get selectedTriggerLabel(): string {
    const selectedOption = this.options().find((option) => option.value === this.selectedValue);
    return selectedOption?.triggerLabel ?? selectedOption?.label ?? '';
  }

  get filteredOptions(): DropdownSelectOption[] {
    const query = this.searchQuery.trim().toLowerCase();
    if (!query) {
      return this.options();
    }

    return this.options().filter((option) => option.label.toLowerCase().includes(query));
  }

  writeValue(value: string | number | boolean | null): void {
    this.selectedValue = value;
  }

  registerOnChange(fn: (value: string | number | boolean | null) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled = isDisabled;
  }

  toggleOpen(): void {
    if (this.disabled) {
      return;
    }

    if (this.isOpen) {
      this.closePanel();
      return;
    }

    this.clearPendingClose();
    this.isClosing = false;
    this.isOpen = true;
    this.updatePanelPlacement();
  }

  selectOption(option: DropdownSelectOption): void {
    if (option.disabled) {
      return;
    }

    this.selectedValue = option.value;
    this.onChange(option.value);
    this.onTouched();

    if (this.closeOnSelect()) {
      this.closePanel();
    }
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (!this.isOpen) {
      return;
    }

    const target = event.target as Node | null;
    if (!target || this.hostRef.nativeElement.contains(target)) {
      return;
    }

    if (this.isInsideOutsideClickBoundary(target)) {
      return;
    }

    this.closePanel();
  }

  @HostListener('window:resize')
  onWindowResize(): void {
    if (!this.isOpen) {
      return;
    }

    this.updatePanelPlacement();
  }

  private closePanel(): void {
    if (!this.isOpen) {
      return;
    }

    this.clearPendingClose();
    this.isClosing = true;
    this.onTouched();

    this.closeTimeoutId = setTimeout(() => {
      this.isOpen = false;
      this.isClosing = false;
      this.searchQuery = '';
      this.closeTimeoutId = null;
    }, this.panelAnimationMs);
  }

  private clearPendingClose(): void {
    if (!this.closeTimeoutId) {
      return;
    }

    clearTimeout(this.closeTimeoutId);
    this.closeTimeoutId = null;
  }

  private isInsideOutsideClickBoundary(target: Node): boolean {
    if (!this.outsideClickBoundarySelector().trim()) {
      return false;
    }

    if (!(target instanceof Element)) {
      return false;
    }

    const boundary = this.hostRef.nativeElement.closest(this.outsideClickBoundarySelector());
    return !!boundary && boundary.contains(target);
  }

  private updatePanelPlacement(): void {
    requestAnimationFrame(() => {
      const host = this.hostRef.nativeElement;
      const trigger = host.querySelector('.dropdown-select__trigger') as HTMLElement | null;
      const panel = host.querySelector('.dropdown-select__panel') as HTMLElement | null;
      if (!trigger || !panel) {
        return;
      }

      const triggerRect = trigger.getBoundingClientRect();
      const availableBelow = Math.max(0, window.innerHeight - triggerRect.bottom - 12);
      const availableAbove = Math.max(0, triggerRect.top - 12);
      const desiredHeight = Math.min(panel.scrollHeight, window.innerHeight - 24);
      const desiredWidth = Math.min(
        Math.max(panel.scrollWidth, triggerRect.width),
        window.innerWidth - 24,
      );
      const availableRight = Math.max(0, window.innerWidth - triggerRect.left - 12);
      const availableLeft = Math.max(0, triggerRect.right - 12);

      this.openDirection =
        availableBelow < desiredHeight && availableAbove > availableBelow ? 'above' : 'below';
      this.openAlignment =
        availableRight < desiredWidth && availableLeft > availableRight ? 'end' : 'start';
    });
  }
}
