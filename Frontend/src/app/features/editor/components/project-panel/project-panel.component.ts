import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import {
  CanvasElement,
  CanvasElementType,
  CanvasPageModel,
} from '../../../../core/models/canvas.models';
import { formatCanvasElementTypeLabel } from '../../../../core/utils/canvas-label.util';

interface LayerEntry {
  id: string;
  depth: number;
  type: CanvasElementType;
  typeLabel: string;
  parentId: string | null;
  name: string;
  visible: boolean;
}

type LayerDropPosition = 'before' | 'after' | 'inside';

@Component({
  selector: 'app-project-panel',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './project-panel.component.html',
  styleUrl: './project-panel.component.css',
})
export class ProjectPanelComponent implements OnChanges {
  @Input() pages: CanvasPageModel[] = [];
  @Input() currentPageId: string | null = null;
  @Input() elements: CanvasElement[] = [];
  @Input() selectedElementId: string | null = null;

  @Output() pageSelected = new EventEmitter<string>();
  @Output() pageCreateRequested = new EventEmitter<void>();
  @Output() layerSelected = new EventEmitter<string>();
  @Output() layerNameChanged = new EventEmitter<{ id: string; name: string }>();
  @Output() layerVisibilityToggled = new EventEmitter<string>();
  @Output() layerMoved = new EventEmitter<{
    draggedId: string;
    targetId: string;
    position: LayerDropPosition;
  }>();

  private cachedLayerEntries: LayerEntry[] = [];
  private draggedLayerId: string | null = null;
  private dragOverLayerId: string | null = null;
  private dragOverPosition: LayerDropPosition = 'before';

  get layerEntries(): LayerEntry[] {
    return this.cachedLayerEntries;
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['elements']) {
      this.cachedLayerEntries = this.buildLayerEntries(this.elements);
    }
  }

  onPageSelect(pageId: string): void {
    this.pageSelected.emit(pageId);
  }

  onPageCreate(): void {
    this.pageCreateRequested.emit();
  }

  onLayerSelected(id: string): void {
    this.layerSelected.emit(id);
  }

  onLayerNameInput(id: string, event: Event): void {
    const name = (event.target as HTMLInputElement).value;
    this.layerNameChanged.emit({ id, name });
  }

  onLayerVisibilityToggle(id: string, event: MouseEvent): void {
    event.stopPropagation();
    this.layerVisibilityToggled.emit(id);
  }

  onLayerDragStart(id: string, event: DragEvent): void {
    this.draggedLayerId = id;
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', id);
    }
  }

  onLayerDragOver(layer: LayerEntry, event: DragEvent): void {
    if (!this.draggedLayerId || this.draggedLayerId === layer.id) {
      return;
    }

    const currentDraggedLayer = this.layerEntries.find((entry) => entry.id === this.draggedLayerId);
    if (!currentDraggedLayer || this.isInvalidLayerDrop(currentDraggedLayer, layer)) {
      return;
    }

    event.preventDefault();
    const bounds = (event.currentTarget as HTMLElement).getBoundingClientRect();
    this.dragOverLayerId = layer.id;
    const relativeY = event.clientY - bounds.top;
    const sameParent = currentDraggedLayer.parentId === layer.parentId;

    if (this.canDropInside(currentDraggedLayer, layer)) {
      if (!sameParent) {
        this.dragOverPosition = 'inside';
        return;
      }

      const upperThreshold = bounds.height * 0.3;
      const lowerThreshold = bounds.height * 0.7;

      if (relativeY <= upperThreshold) {
        this.dragOverPosition = 'before';
      } else if (relativeY >= lowerThreshold) {
        this.dragOverPosition = 'after';
      } else {
        this.dragOverPosition = 'inside';
      }

      return;
    }

    this.dragOverPosition = relativeY < bounds.height / 2 ? 'before' : 'after';
  }

  onLayerDrop(layer: LayerEntry, event: DragEvent): void {
    event.preventDefault();

    if (!this.draggedLayerId || this.draggedLayerId === layer.id) {
      this.clearDragState();
      return;
    }

    const currentDraggedLayer = this.layerEntries.find((entry) => entry.id === this.draggedLayerId);
    if (!currentDraggedLayer || this.isInvalidLayerDrop(currentDraggedLayer, layer)) {
      this.clearDragState();
      return;
    }

    this.layerMoved.emit({
      draggedId: this.draggedLayerId,
      targetId: layer.id,
      position: this.dragOverPosition,
    });

    this.clearDragState();
  }

  onLayerDragEnd(): void {
    this.clearDragState();
  }

  isLayerDragging(id: string): boolean {
    return this.draggedLayerId === id;
  }

  isLayerDropTarget(id: string, position: LayerDropPosition): boolean {
    return this.dragOverLayerId === id && this.dragOverPosition === position;
  }

  isFrame(type: CanvasElementType): boolean {
    return type === 'frame';
  }

  isRectangle(type: CanvasElementType): boolean {
    return type === 'rectangle';
  }

  isCircle(type: CanvasElementType): boolean {
    return type === 'circle';
  }

  isText(type: CanvasElementType): boolean {
    return type === 'text';
  }

  trackByLayerId(_: number, layer: LayerEntry): string {
    return layer.id;
  }

  trackByPageId(_: number, page: CanvasPageModel): string {
    return page.id;
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
          type: child.type,
          typeLabel,
          parentId: child.parentId ?? null,
          name: typeof child.name === 'string' ? child.name : fallbackName,
          visible: child.visible !== false,
        });

        walk(child.id, depth + 1);
      }
    };

    walk(null, 0);
    return entries;
  }

  private clearDragState(): void {
    this.draggedLayerId = null;
    this.dragOverLayerId = null;
    this.dragOverPosition = 'before';
  }

  private canDropInside(dragged: LayerEntry, target: LayerEntry): boolean {
    return (
      target.type === 'frame' &&
      dragged.type !== 'frame' &&
      !this.isDescendantOf(dragged.id, target.id)
    );
  }

  private isInvalidLayerDrop(dragged: LayerEntry, target: LayerEntry): boolean {
    return dragged.id === target.id || this.isDescendantOf(dragged.id, target.id);
  }

  private isDescendantOf(ancestorId: string, elementId: string): boolean {
    const parentById = new Map(
      this.elements.map((element) => [element.id, element.parentId ?? null]),
    );
    let currentParentId = parentById.get(elementId) ?? null;

    while (currentParentId) {
      if (currentParentId === ancestorId) {
        return true;
      }

      currentParentId = parentById.get(currentParentId) ?? null;
    }

    return false;
  }
}
