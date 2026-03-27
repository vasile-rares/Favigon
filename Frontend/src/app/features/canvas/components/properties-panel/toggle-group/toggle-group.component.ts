import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';

export type ToggleGroupValue = string | number | boolean;

export interface ToggleGroupOption {
  label: string;
  value: ToggleGroupValue;
  ariaLabel?: string;
  title?: string;
}

@Component({
  selector: 'app-toggle-group',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './toggle-group.component.html',
  styleUrl: './toggle-group.component.css',
})
export class ToggleGroupComponent {
  @Input() options: readonly ToggleGroupOption[] = [];
  @Input() value: ToggleGroupValue | null = null;
  @Input() minWidth: string | null = '108px';
  @Input() stretch = false;
  @Input() ariaLabel = 'Toggle group';

  @Output() valueChange = new EventEmitter<ToggleGroupValue>();

  get activeIndex(): number {
    const index = this.options.findIndex((option) => option.value === this.value);
    return index < 0 ? 0 : index;
  }

  get hasActiveOption(): boolean {
    return this.options.some((option) => option.value === this.value);
  }

  onOptionClick(option: ToggleGroupOption): void {
    if (option.value === this.value) {
      return;
    }

    this.valueChange.emit(option.value);
  }

  isActive(option: ToggleGroupOption): boolean {
    return option.value === this.value;
  }
}
