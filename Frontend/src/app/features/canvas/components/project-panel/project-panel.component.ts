import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import {
  CanvasElement,
  CanvasElementType,
  CanvasPageModel,
} from '../../../../core/models/canvas.models';
import { formatCanvasElementTypeLabel } from '../../utils/canvas-label.util';

interface LayerEntry {
  id: string;
  depth: number;
  type: CanvasElementType;
  typeLabel: string;
  parentId: string | null;
  name: string;
  visible: boolean;
  hasChildren: boolean;
}

type LayerDropPosition = 'before' | 'after' | 'inside';
type PageRenameSource = 'pages' | 'layers';

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
  @Input() focusedPageId: string | null = null;
  @Input() elements: CanvasElement[] = [];
  @Input() selectedElementId: string | null = null;

  @Output() pageSelected = new EventEmitter<string>();
  @Output() pageCreateRequested = new EventEmitter<void>();
  @Output() pageDeleteRequested = new EventEmitter<string>();
  @Output() pageNameChanged = new EventEmitter<{ id: string; name: string }>();
  @Output() layerSelected = new EventEmitter<string>();
  @Output() layerNameChanged = new EventEmitter<{ id: string; name: string }>();
  @Output() layerVisibilityToggled = new EventEmitter<string>();
  @Output() layerMoved = new EventEmitter<{
    draggedId: string;
    targetId: string;
    position: LayerDropPosition;
  }>();
  @Output() layerContextMenuRequested = new EventEmitter<{ id: string; x: number; y: number }>();

  private cachedLayerEntries: LayerEntry[] = [];
  private draggedLayerId: string | null = null;
  private dragOverLayerId: string | null = null;
  private dragOverPosition: LayerDropPosition = 'before';
  private collapsedLayers = new Set<string>();
  editingLayerId: string | null = null;
  editingPageId: string | null = null;
  private editingPageName = '';
  private editingPageSource: PageRenameSource | null = null;

  get layerEntries(): LayerEntry[] {
    return this.cachedLayerEntries;
  }

  get visiblePageLayers(): CanvasPageModel[] {
    if (this.focusedPageId) {
      return this.pages.filter((p) => p.id === this.focusedPageId);
    }
    return this.pages;
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['elements']) {
      this.cachedLayerEntries = this.buildLayerEntries(this.elements);
    }
  }

  onPageSelect(pageId: string): void {
    this.pageSelected.emit(pageId);
  }

  startPageRename(pageId: string, event: MouseEvent, source: PageRenameSource = 'pages'): void {
    event.stopPropagation();
    const page = this.pages.find((p) => p.id === pageId);
    this.editingPageName = page?.name ?? '';
    this.editingPageId = pageId;
    this.editingPageSource = source;
    setTimeout(() => {
      const input = document.querySelector<HTMLInputElement>(
        `[data-page-name-id="${source}-${pageId}"]`,
      );
      input?.select();
    });
  }

  isPageRenameActive(pageId: string, source: PageRenameSource): boolean {
    return this.editingPageId === pageId && this.editingPageSource === source;
  }

  stopPageRename(pageId: string): void {
    if (this.editingPageId === pageId) {
      const trimmed = this.editingPageName.trim();
      if (trimmed) {
        this.pageNameChanged.emit({ id: pageId, name: trimmed });
      }
      this.editingPageId = null;
      this.editingPageName = '';
      this.editingPageSource = null;
    }
  }

  onPageNameInput(pageId: string, event: Event): void {
    this.editingPageName = (event.target as HTMLInputElement).value;
  }

  onPageNameKeyDown(pageId: string, event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      (event.target as HTMLInputElement).blur();
    } else if (event.key === 'Escape') {
      this.editingPageId = null;
      this.editingPageName = '';
      this.editingPageSource = null;
    }
  }

  onPageCreate(): void {
    this.pageCreateRequested.emit();
  }

  onPageDelete(pageId: string, event: MouseEvent): void {
    event.stopPropagation();

    if (this.pages.length <= 1) {
      return;
    }

    this.pageDeleteRequested.emit(pageId);
  }

  onLayerSelected(id: string): void {
    this.layerSelected.emit(id);
  }

  onLayerNameInput(id: string, event: Event): void {
    const name = (event.target as HTMLInputElement).value;
    this.layerNameChanged.emit({ id, name });
  }

  onLayerNameClick(id: string, event: MouseEvent): void {
    event.stopPropagation();
    if (this.editingLayerId !== id) {
      this.layerSelected.emit(id);
    }
  }

  startRename(id: string, event: MouseEvent): void {
    event.stopPropagation();
    this.editingLayerId = id;
    setTimeout(() => {
      const input = document.querySelector<HTMLInputElement>(`[data-layer-name-id="${id}"]`);
      input?.select();
    });
  }

  stopRename(id: string): void {
    if (this.editingLayerId === id) {
      this.editingLayerId = null;
    }
  }

  onLayerVisibilityToggle(id: string, event: MouseEvent): void {
    event.stopPropagation();
    this.layerVisibilityToggled.emit(id);
  }

  onLayerContextMenu(id: string, event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.layerContextMenuRequested.emit({ id, x: event.clientX, y: event.clientY });
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

  isLayerCollapsed(id: string): boolean {
    return this.collapsedLayers.has(id);
  }

  toggleLayerCollapse(id: string, event: MouseEvent): void {
    event.stopPropagation();
    if (this.collapsedLayers.has(id)) {
      this.collapsedLayers.delete(id);
    } else {
      this.collapsedLayers.add(id);
    }
    this.cachedLayerEntries = this.buildLayerEntries(this.elements);
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

  isText(type: CanvasElementType): boolean {
    return type === 'text';
  }

  trackByLayerId(_: number, layer: LayerEntry): string {
    return layer.id;
  }

  trackByPageId(_: number, page: CanvasPageModel): string {
    return page.id;
  }

  getPageViewportLabel(page: CanvasPageModel): string {
    const preset = page.viewportPreset ?? 'desktop';
    const width =
      typeof page.viewportWidth === 'number' && Number.isFinite(page.viewportWidth)
        ? Math.max(100, Math.round(page.viewportWidth))
        : 1280;
    const height =
      typeof page.viewportHeight === 'number' && Number.isFinite(page.viewportHeight)
        ? Math.max(100, Math.round(page.viewportHeight))
        : 720;

    const presetLabel =
      preset === 'desktop'
        ? 'Desktop'
        : preset === 'tablet'
          ? 'Tablet'
          : preset === 'mobile'
            ? 'Mobile'
            : 'Custom';

    return `${presetLabel} · ${width} × ${height}`;
  }

  canDeletePage(): boolean {
    return this.pages.length > 1;
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
          hasChildren: (childrenByParent.get(child.id)?.length ?? 0) > 0,
        });

        if (!this.collapsedLayers.has(child.id)) {
          walk(child.id, depth + 1);
        }
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
