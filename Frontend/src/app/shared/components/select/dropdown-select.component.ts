import { CommonModule } from '@angular/common';
import { Component, ElementRef, HostListener, Input, Optional, Self } from '@angular/core';
import { ControlValueAccessor, FormsModule, NgControl } from '@angular/forms';
import { TextInputComponent } from '../input/text-input.component';

export interface DropdownSelectOption {
  label: string;
  value: string | number | boolean;
}

@Component({
  selector: 'app-dropdown-select',
  standalone: true,
  imports: [CommonModule, FormsModule, TextInputComponent],
  templateUrl: './dropdown-select.component.html',
  styleUrl: './dropdown-select.component.css',
})
export class DropdownSelectComponent implements ControlValueAccessor {
  @Input() id?: string;
  @Input() label = '';
  @Input() placeholder = 'Select an option';
  @Input() requiredMarker = false;
  @Input() emptyText = 'No items found.';
  @Input() enableSearch = true;
  @Input() options: DropdownSelectOption[] = [];

  isOpen = false;
  isClosing = false;
  searchQuery = '';
  selectedValue: string | number | boolean | null = null;
  disabled = false;

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

  get selectedLabel(): string {
    const selectedOption = this.options.find((option) => option.value === this.selectedValue);
    return selectedOption?.label ?? '';
  }

  get filteredOptions(): DropdownSelectOption[] {
    const query = this.searchQuery.trim().toLowerCase();
    if (!query) {
      return this.options;
    }

    return this.options.filter((option) => option.label.toLowerCase().includes(query));
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
  }

  selectOption(option: DropdownSelectOption): void {
    this.selectedValue = option.value;
    this.onChange(option.value);
    this.onTouched();
    this.closePanel();
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

    this.closePanel();
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
}
