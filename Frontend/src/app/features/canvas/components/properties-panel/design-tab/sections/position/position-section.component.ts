import { Component, input, output, ViewEncapsulation } from '@angular/core';

import { FormsModule } from '@angular/forms';
import { DropdownSelectComponent } from '@app/shared';
import type { DropdownSelectOption } from '@app/shared';
import { CanvasElement, CanvasPositionMode } from '@app/core';

@Component({
  selector: 'app-dt-position-section',
  standalone: true,
  imports: [FormsModule, DropdownSelectComponent],
  templateUrl: './position-section.component.html',
  encapsulation: ViewEncapsulation.None,
})
export class PositionSectionComponent {
  readonly element = input.required<CanvasElement>();
  readonly elementPatch = output<Partial<CanvasElement>>();

  readonly positionOptions: DropdownSelectOption[] = [
    { label: 'Static', value: 'static' },
    { label: 'Relative', value: 'relative' },
    { label: 'Absolute', value: 'absolute' },
    { label: 'Fixed', value: 'fixed' },
    { label: 'Sticky', value: 'sticky' },
  ];

  readonly svgPositionOptions: DropdownSelectOption[] = [
    { label: 'Relative', value: 'relative' },
    { label: 'Absolute', value: 'absolute' },
  ];

  supportsPosition(type: CanvasElement['type']): boolean {
    return type !== 'frame';
  }

  positionOptionsForElement(element: CanvasElement): DropdownSelectOption[] {
    return element.type === 'svg' ? this.svgPositionOptions : this.positionOptions;
  }

  positionValue(element: CanvasElement): CanvasPositionMode {
    return element.position ?? 'static';
  }

  onPositionChange(value: string | number | boolean | null): void {
    if (typeof value !== 'string') return;
    this.elementPatch.emit({
      position: value === 'static' ? undefined : (value as CanvasPositionMode),
    });
  }
}
