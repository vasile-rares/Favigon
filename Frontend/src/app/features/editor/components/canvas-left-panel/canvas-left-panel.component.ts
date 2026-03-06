import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { CanvasElement, CanvasElementType } from '../../../../core/models/canvas.models';
import { formatCanvasElementTypeLabel } from '../../../../core/utils/canvas-label.util';

type SupportedFramework = 'html' | 'react' | 'angular';

interface LayerEntry {
  id: string;
  depth: number;
  typeLabel: string;
  name: string;
}

@Component({
  selector: 'app-canvas-left-panel',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './canvas-left-panel.component.html',
  styleUrl: './canvas-left-panel.component.css',
})
export class CanvasLeftPanelComponent implements OnChanges {
  @Input() selectedFramework: SupportedFramework = 'html';
  @Input() validationResult: boolean | null = null;
  @Input() apiError: string | null = null;
  @Input() isValidating = false;
  @Input() isGenerating = false;
  @Input() generatedHtml = '';
  @Input() generatedCss = '';
  @Input() irPreview: unknown = null;
  @Input() elements: CanvasElement[] = [];
  @Input() selectedElementId: string | null = null;

  @Output() frameworkChanged = new EventEmitter<SupportedFramework>();
  @Output() validateRequested = new EventEmitter<void>();
  @Output() generateRequested = new EventEmitter<void>();
  @Output() layerSelected = new EventEmitter<string>();
  @Output() layerNameChanged = new EventEmitter<{ id: string; name: string }>();

  private cachedLayerEntries: LayerEntry[] = [];

  get layerEntries(): LayerEntry[] {
    return this.cachedLayerEntries;
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['elements']) {
      this.cachedLayerEntries = this.buildLayerEntries(this.elements);
    }
  }

  onFrameworkChange(event: Event): void {
    const framework = (event.target as HTMLSelectElement).value as SupportedFramework;
    this.frameworkChanged.emit(framework);
  }

  onLayerSelected(id: string): void {
    this.layerSelected.emit(id);
  }

  onLayerNameInput(id: string, event: Event): void {
    const name = (event.target as HTMLInputElement).value;
    this.layerNameChanged.emit({ id, name });
  }

  trackByLayerId(_: number, layer: LayerEntry): string {
    return layer.id;
  }

  private buildLayerEntries(elements: CanvasElement[]): LayerEntry[] {
    if (elements.length === 0) {
      return [];
    }

    const elementIds = new Set(elements.map((element) => element.id));
    const childrenByParent = new Map<string | null, CanvasElement[]>();

    for (const element of elements) {
      const parentKey =
        element.parentId && elementIds.has(element.parentId) ? element.parentId : null;
      const existingChildren = childrenByParent.get(parentKey);
      if (existingChildren) {
        existingChildren.push(element);
      } else {
        childrenByParent.set(parentKey, [element]);
      }
    }

    const entries: LayerEntry[] = [];
    const seen = new Set<string>();
    const typeCounters = new Map<CanvasElementType, number>();

    const walk = (parentId: string | null, depth: number) => {
      const children = childrenByParent.get(parentId) ?? [];
      for (const child of children) {
        if (seen.has(child.id)) {
          continue;
        }

        seen.add(child.id);
        const nextTypeCount = (typeCounters.get(child.type) ?? 0) + 1;
        typeCounters.set(child.type, nextTypeCount);

        const typeLabel = formatCanvasElementTypeLabel(child.type);
        const fallbackName = `${typeLabel} ${nextTypeCount}`;

        entries.push({
          id: child.id,
          depth,
          typeLabel,
          name: typeof child.name === 'string' ? child.name : fallbackName,
        });

        walk(child.id, depth + 1);
      }
    };

    walk(null, 0);
    return entries;
  }
}
