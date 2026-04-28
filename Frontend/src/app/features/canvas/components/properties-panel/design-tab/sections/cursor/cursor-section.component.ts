import { Component, input, output, ViewEncapsulation } from '@angular/core';

import { FormsModule } from '@angular/forms';
import { DropdownSelectComponent } from '@app/shared';
import type { DropdownSelectOption } from '@app/shared';
import { CanvasCursorType, CanvasElement } from '@app/core';

@Component({
  selector: 'app-dt-cursor-section',
  standalone: true,
  imports: [FormsModule, DropdownSelectComponent],
  templateUrl: './cursor-section.component.html',
  encapsulation: ViewEncapsulation.None,
})
export class CursorSectionComponent {
  readonly element = input.required<CanvasElement>();
  readonly elementPatch = output<Partial<CanvasElement>>();

  readonly cursorOptions: DropdownSelectOption[] = [
    { label: 'Auto (inherit)', value: 'auto' },
    { label: 'Default', value: 'default' },
    { label: 'Pointer', value: 'pointer' },
    { label: 'Text', value: 'text' },
    { label: 'Move', value: 'move' },
    { label: 'Grab', value: 'grab' },
    { label: 'Grabbing', value: 'grabbing' },
    { label: 'Not Allowed', value: 'not-allowed' },
    { label: 'Wait', value: 'wait' },
    { label: 'Progress', value: 'progress' },
    { label: 'Crosshair', value: 'crosshair' },
    { label: 'Zoom In', value: 'zoom-in' },
    { label: 'Zoom Out', value: 'zoom-out' },
    { label: 'Help', value: 'help' },
    { label: 'N/S Resize', value: 'ns-resize' },
    { label: 'E/W Resize', value: 'ew-resize' },
    { label: 'Col Resize', value: 'col-resize' },
    { label: 'Row Resize', value: 'row-resize' },
    { label: 'None', value: 'none' },
  ];

  hasCursor(element: CanvasElement): boolean {
    return !!element.cursor;
  }

  onCursorSectionHeaderClick(): void {
    if (this.hasCursor(this.element())) {
      this.elementPatch.emit({ cursor: undefined });
      return;
    }
    this.elementPatch.emit({ cursor: 'pointer' });
  }

  onCursorSectionToggleClick(event: MouseEvent): void {
    event.stopPropagation();
    this.onCursorSectionHeaderClick();
  }

  cursorValue(element: CanvasElement): CanvasCursorType | null {
    return element.cursor ?? null;
  }

  onCursorChange(value: string | number | boolean | null): void {
    if (typeof value !== 'string') return;
    this.elementPatch.emit({ cursor: (value as CanvasCursorType) || undefined });
  }
}
