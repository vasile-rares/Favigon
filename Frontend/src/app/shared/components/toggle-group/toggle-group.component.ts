import { Component, input, output } from '@angular/core';

export type ToggleGroupValue = string | number | boolean;
export type ToggleGroupIcon =
  | 'direction-horizontal'
  | 'direction-vertical'
  | 'align-horizontal-start'
  | 'align-horizontal-center'
  | 'align-horizontal-end'
  | 'align-vertical-start'
  | 'align-vertical-center'
  | 'align-vertical-end'
  | 'text-align-left'
  | 'text-align-center'
  | 'text-align-right'
  | 'text-align-justify'
  | 'radius-full'
  | 'radius-corners'
  | 'border-all'
  | 'border-sides'
  | 'spacing-all'
  | 'spacing-sides'
  | 'paint-solid'
  | 'paint-linear'
  | 'paint-radial'
  | 'paint-conic'
  | 'paint-image'
  | 'grow-auto-width'
  | 'grow-auto-height'
  | 'grow-fixed';

export interface ToggleGroupOption {
  label: string;
  value: ToggleGroupValue;
  ariaLabel?: string;
  title?: string;
  icon?: ToggleGroupIcon;
}

@Component({
  selector: 'app-toggle-group',
  standalone: true,
  imports: [],
  templateUrl: './toggle-group.component.html',
  styleUrl: './toggle-group.component.css',
})
export class ToggleGroupComponent {
  readonly options = input<readonly ToggleGroupOption[]>([]);
  readonly value = input<ToggleGroupValue | null>(null);
  readonly minWidth = input<string | null>('108px');
  readonly stretch = input(false);
  readonly ariaLabel = input('Toggle group');

  readonly valueChange = output<ToggleGroupValue>();

  get activeIndex(): number {
    const index = this.options().findIndex((option) => option.value === this.value());
    return index < 0 ? 0 : index;
  }

  get hasActiveOption(): boolean {
    return this.options().some((option) => option.value === this.value());
  }

  onOptionClick(option: ToggleGroupOption): void {
    if (option.value === this.value()) {
      return;
    }

    this.valueChange.emit(option.value);
  }

  isActive(option: ToggleGroupOption): boolean {
    return option.value === this.value();
  }
}
