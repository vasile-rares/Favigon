import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CanvasElement, CanvasElementType } from '../../../core/models/canvas.models';

type EditableNumericField = 'x' | 'y' | 'width' | 'height' | 'fontSize';

@Component({
  selector: 'app-canvas-design-sidepanel',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './canvas-design-sidepanel.component.html',
  styleUrl: './canvas-design-sidepanel.component.css',
})
export class CanvasDesignSidepanelComponent {
  @Input() selectedElement: CanvasElement | null = null;

  @Output() elementPatch = new EventEmitter<Partial<CanvasElement>>();

  toDisplayNumber(value: number | undefined): string {
    if (!Number.isFinite(value ?? Number.NaN)) {
      return '';
    }

    return this.roundToTwoDecimals(value as number).toString();
  }

  get elementTypeLabel(): string {
    if (!this.selectedElement) {
      return '';
    }

    return `${this.selectedElement.type.charAt(0).toUpperCase()}${this.selectedElement.type.slice(1)}`;
  }

  hasFill(type: CanvasElementType): boolean {
    return type !== 'text' && type !== 'image';
  }

  isText(type: CanvasElementType): boolean {
    return type === 'text';
  }

  isImage(type: CanvasElementType): boolean {
    return type === 'image';
  }

  onNumberChange(field: EditableNumericField, event: Event): void {
    const value = Number((event.target as HTMLInputElement).value);
    if (!Number.isFinite(value)) {
      return;
    }

    const rounded = this.roundToTwoDecimals(value);
    (event.target as HTMLInputElement).value = rounded.toString();
    this.emitPatch({ [field]: rounded } as Partial<CanvasElement>);
  }

  onFillChange(event: Event): void {
    const fill = (event.target as HTMLInputElement).value;
    this.emitPatch({ fill });
  }

  onTextChange(field: 'text' | 'imageUrl', event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.emitPatch({ [field]: value } as Partial<CanvasElement>);
  }

  private emitPatch(patch: Partial<CanvasElement>): void {
    this.elementPatch.emit(patch);
  }

  private roundToTwoDecimals(value: number): number {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }
}
