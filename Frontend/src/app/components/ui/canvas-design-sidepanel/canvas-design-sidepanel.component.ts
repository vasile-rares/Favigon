import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import {
  CanvasElement,
  CanvasElementType,
  CanvasStrokePosition,
} from '../../../core/models/canvas.models';
import { formatCanvasElementTypeLabel } from '../../../core/utils/canvas-label.util';

type EditableNumericField =
  | 'x'
  | 'y'
  | 'width'
  | 'height'
  | 'fontSize'
  | 'strokeWidth'
  | 'opacity'
  | 'cornerRadius';

interface FrameTemplate {
  name: string;
  sizeLabel: string;
  width: number;
  height: number;
}

@Component({
  selector: 'app-canvas-design-sidepanel',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './canvas-design-sidepanel.component.html',
  styleUrl: './canvas-design-sidepanel.component.css',
})
export class CanvasDesignSidepanelComponent {
  @Input() selectedElement: CanvasElement | null = null;
  @Input() currentTool: CanvasElementType | 'select' = 'select';

  @Output() elementPatch = new EventEmitter<Partial<CanvasElement>>();
  @Output() frameTemplateSelected = new EventEmitter<Pick<FrameTemplate, 'width' | 'height'>>();

  readonly strokePositionOptions: CanvasStrokePosition[] = ['inside', 'outside'];

  readonly frameTemplates: FrameTemplate[] = [
    {
      name: 'iPhone',
      sizeLabel: '390 × 844',
      width: 390,
      height: 844,
    },
    {
      name: 'Tablet',
      sizeLabel: '820 × 1180',
      width: 820,
      height: 1180,
    },
    {
      name: 'Desktop',
      sizeLabel: '1440 × 900',
      width: 1440,
      height: 900,
    },
  ];

  private readonly defaultFillColor = '#e0e0e0';
  private readonly defaultFrameFillColor = '#3f3f46';
  private readonly defaultStrokeColor = '#52525b';

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

    return formatCanvasElementTypeLabel(this.selectedElement.type);
  }

  hasFill(type: CanvasElementType): boolean {
    return type !== 'text' && type !== 'image';
  }

  hasStroke(type: CanvasElementType): boolean {
    return type !== 'text';
  }

  supportsCornerRadius(type: CanvasElementType): boolean {
    return type !== 'circle' && type !== 'text';
  }

  isFrame(type: CanvasElementType): boolean {
    return type === 'frame';
  }

  isFrameToolSelected(): boolean {
    return this.currentTool === 'frame';
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

  onStrokeChange(event: Event): void {
    const stroke = (event.target as HTMLInputElement).value;
    this.emitPatch({ stroke });
  }

  onStrokePositionChange(event: Event): void {
    const strokePosition = (event.target as HTMLSelectElement).value as CanvasStrokePosition;
    this.emitPatch({ strokePosition });
  }

  strokePositionValue(element: CanvasElement): CanvasStrokePosition {
    return element.strokePosition ?? 'inside';
  }

  fillInputValue(element: CanvasElement): string {
    const fallback = element.type === 'frame' ? this.defaultFrameFillColor : this.defaultFillColor;
    return this.toHexColorOrFallback(element.fill, fallback);
  }

  strokeInputValue(element: CanvasElement): string {
    return this.toHexColorOrFallback(element.stroke, this.defaultStrokeColor);
  }

  applyFrameTemplate(template: FrameTemplate): void {
    this.frameTemplateSelected.emit({
      width: template.width,
      height: template.height,
    });

    if (this.selectedElement?.type === 'frame') {
      this.emitPatch({
        width: template.width,
        height: template.height,
      });
    }
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

  private toHexColorOrFallback(value: string | undefined, fallback: string): string {
    if (!value) {
      return fallback;
    }

    const normalized = value.trim();
    if (/^#([A-Fa-f0-9]{3}|[A-Fa-f0-9]{6})$/.test(normalized)) {
      return normalized;
    }

    return fallback;
  }
}
