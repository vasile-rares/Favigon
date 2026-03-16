import { CommonModule } from '@angular/common';
import { Component, Input, Optional, Self } from '@angular/core';
import { ControlValueAccessor, FormsModule, NgControl } from '@angular/forms';

@Component({
  selector: 'app-text-input',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './text-input.component.html',
  styleUrl: './text-input.component.css',
})
export class TextInputComponent implements ControlValueAccessor {
  @Input() id?: string;
  @Input() label = '';
  @Input() placeholder = '';
  @Input() type: 'text' | 'email' | 'password' | 'url' | 'search' = 'text';
  @Input() autocomplete = 'off';
  @Input() requiredMarker = false;
  @Input() maxLength?: number;
  @Input() errorText = '';
  @Input() forceInvalid = false;
  @Input() enablePasswordToggle = false;
  @Input() readonly = false;
  
  // Multiline specific
  @Input() multiline = false;
  @Input() rows = 3;

  value = '';
  disabled = false;
  passwordVisible = false;

  private onChange: (value: string) => void = () => undefined;
  private onTouched: () => void = () => undefined;

  constructor(@Optional() @Self() private readonly ngControl: NgControl) {
    if (this.ngControl) {
      this.ngControl.valueAccessor = this;
    }
  }

  get isInvalid(): boolean {
    if (this.forceInvalid) {
      return true;
    }

    const control = this.ngControl?.control;
    return !!control && control.invalid && (control.dirty || control.touched);
  }

  get computedType(): string {
    if (this.type === 'password' && this.enablePasswordToggle && this.passwordVisible) {
      return 'text';
    }

    return this.type;
  }

  writeValue(value: string | null): void {
    this.value = value ?? '';
  }

  registerOnChange(fn: (value: string) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled = isDisabled;
  }

  handleInput(event: Event): void {
    const nextValue = (event.target as HTMLInputElement).value;
    this.value = nextValue;
    this.onChange(nextValue);
  }

  handleBlur(): void {
    // onTouched() intentionally omitted — validation errors are shown
    // only after the form is submitted via markAllAsTouched(), not on blur.
  }

  togglePasswordVisibility(): void {
    if (this.disabled || this.type !== 'password' || !this.enablePasswordToggle) {
      return;
    }

    this.passwordVisible = !this.passwordVisible;
  }
}
