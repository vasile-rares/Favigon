import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import {
  CanvasElement,
  CanvasElementType,
  CanvasPageModel,
} from '../../../../core/models/canvas.models';
import {
  ContextMenuComponent,
  ContextMenuItem,
} from '../../../../shared/components/context-menu/context-menu.component';
import { formatCanvasElementTypeLabel } from '../../utils/canvas-label.util';

interface LayerEntry {
  pageId: string;
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
type PageMenuContext = 'pages' | 'layers';

@Component({
  selector: 'app-project-panel',
  standalone: true,
  imports: [CommonModule, ContextMenuComponent],
  templateUrl: './project-panel.component.html',
  styleUrl: './project-panel.component.css',
})
export class ProjectPanelComponent implements OnChanges {
  @Input() pages: CanvasPageModel[] = [];
  @Input() currentPageId: string | null = null;
  @Input() focusedPageId: string | null = null;
  @Input() selectedPageLayerId: string | null = null;
  @Input() canPastePage = false;
  @Input() elements: CanvasElement[] = [];
  @Input() selectedElementId: string | null = null;

  @Output() pageSelected = new EventEmitter<string>();
  @Output() pageLayerSelected = new EventEmitter<string>();
  @Output() pageCreateRequested = new EventEmitter<void>();
  @Output() pageCopyRequested = new EventEmitter<string>();
  @Output() pagePasteRequested = new EventEmitter<string>();
  @Output() pageDuplicateRequested = new EventEmitter<string>();
  @Output() pageDeleteRequested = new EventEmitter<string>();
  @Output() pageNameChanged = new EventEmitter<{ id: string; name: string }>();
  @Output() layerSelected = new EventEmitter<{ pageId: string; id: string }>();
  @Output() layerNameChanged = new EventEmitter<{ pageId: string; id: string; name: string }>();
  @Output() layerVisibilityToggled = new EventEmitter<{ pageId: string; id: string }>();
  @Output() layerMoved = new EventEmitter<{
    pageId: string;
    draggedId: string;
    targetId: string;
    position: LayerDropPosition;
  }>();
  @Output() layerContextMenuRequested = new EventEmitter<{
    pageId: string;
    id: string;
    x: number;
    y: number;
  }>();

  private cachedLayerEntriesByPage = new Map<string, LayerEntry[]>();
  private draggedLayerId: string | null = null;
  private draggedLayerPageId: string | null = null;
  private dragOverLayerId: string | null = null;
  private dragOverLayerPageId: string | null = null;
  private dragOverPosition: LayerDropPosition = 'before';
  private collapsedLayers = new Set<string>();
  private collapsedPageLayers = new Set<string>();
  editingLayerId: string | null = null;
  editingPageId: string | null = null;
  pageMenuPageId: string | null = null;
  pageMenuItems: ContextMenuItem[] = [];
  pageMenuX = 0;
  pageMenuY = 0;
  private pageMenuContext: PageMenuContext | null = null;
  private editingPageName = '';
  private editingPageSource: PageRenameSource | null = null;

  get layerEntries(): LayerEntry[] {
    const focusedPageId = this.focusedPageId;
    return focusedPageId ? this.getLayerEntriesForPage(focusedPageId) : [];
  }

  get visiblePageLayers(): CanvasPageModel[] {
    if (this.focusedPageId) {
      return this.pages.filter((p) => p.id === this.focusedPageId);
    }
    return this.pages;
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['pages'] || changes['elements']) {
      this.rebuildLayerEntriesByPage();
    }
  }

  onPageSelect(pageId: string): void {
    this.closePageMenu();
    this.pageSelected.emit(pageId);
  }

  onLayerPageSelect(pageId: string): void {
    this.closePageMenu();
    this.pageLayerSelected.emit(pageId);
  }

  startPageRename(pageId: string, event?: MouseEvent, source: PageRenameSource = 'pages'): void {
    event?.stopPropagation();
    this.closePageMenu();
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
    this.closePageMenu();
    this.pageCreateRequested.emit();
  }

  togglePageMenu(pageId: string, event: MouseEvent): void {
    event.stopPropagation();

    if (this.pageMenuPageId === pageId && this.pageMenuContext === 'pages') {
      this.closePageMenu();
      return;
    }

    const trigger = event.currentTarget as HTMLElement;
    const rect = trigger.getBoundingClientRect();

    this.openPageMenu(pageId, rect.right, rect.bottom + 6, 'pages');
  }

  onLayerPageContextMenu(pageId: string, event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();

    this.onLayerPageSelect(pageId);
    this.openPageMenu(pageId, event.clientX, event.clientY, 'layers');
  }

  private openPageMenu(pageId: string, x: number, y: number, context: PageMenuContext): void {
    const renameSource: PageRenameSource = context === 'layers' ? 'layers' : 'pages';

    this.pageMenuPageId = pageId;
    this.pageMenuContext = context;
    this.pageMenuX = x;
    this.pageMenuY = y;
    this.pageMenuItems =
      context === 'layers'
        ? [
            {
              id: 'copy',
              label: 'Copy',
              shortcut: 'Ctrl+C',
              action: () => this.onPageCopy(pageId),
            },
            {
              id: 'paste',
              label: 'Paste',
              shortcut: 'Ctrl+V',
              disabled: !this.canPastePage,
              action: () => this.onPagePaste(pageId),
            },
            {
              id: 'rename',
              label: 'Rename',
              separator: true,
              action: () => this.startPageRename(pageId, undefined, renameSource),
            },
            {
              id: 'delete',
              label: 'Delete',
              variant: 'danger',
              disabled: !this.canDeletePage(),
              action: () => this.onPageDelete(pageId),
            },
          ]
        : [
            {
              id: 'rename',
              label: 'Rename',
              action: () => this.startPageRename(pageId, undefined, renameSource),
            },
            {
              id: 'duplicate',
              label: 'Duplicate',
              action: () => this.onPageDuplicate(pageId),
            },
            {
              id: 'delete',
              label: 'Delete',
              variant: 'danger',
              separator: true,
              disabled: !this.canDeletePage(),
              action: () => this.onPageDelete(pageId),
            },
          ];
  }

  closePageMenu(): void {
    this.pageMenuPageId = null;
    this.pageMenuContext = null;
    this.pageMenuItems = [];
  }

  isPageMenuOpenFor(pageId: string): boolean {
    return this.pageMenuContext === 'pages' && this.pageMenuPageId === pageId;
  }

  onPageCopy(pageId: string): void {
    this.closePageMenu();
    this.pageCopyRequested.emit(pageId);
  }

  onPagePaste(pageId: string): void {
    this.closePageMenu();
    this.pagePasteRequested.emit(pageId);
  }

  onPageDuplicate(pageId: string): void {
    this.closePageMenu();
    this.pageDuplicateRequested.emit(pageId);
  }

  onPageDelete(pageId: string, event?: MouseEvent): void {
    event?.stopPropagation();
    this.closePageMenu();

    if (this.pages.length <= 1) {
      return;
    }

    this.pageDeleteRequested.emit(pageId);
  }

  onLayerSelected(pageId: string, id: string): void {
    this.closePageMenu();
    this.layerSelected.emit({ pageId, id });
  }

  onLayerNameInput(pageId: string, id: string, event: Event): void {
    const name = (event.target as HTMLInputElement).value;
    this.layerNameChanged.emit({ pageId, id, name });
  }

  onLayerNameClick(pageId: string, id: string, event: MouseEvent): void {
    event.stopPropagation();
    if (this.editingLayerId !== id) {
      this.layerSelected.emit({ pageId, id });
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

  onLayerVisibilityToggle(pageId: string, id: string, event: MouseEvent): void {
    event.stopPropagation();
    this.layerVisibilityToggled.emit({ pageId, id });
  }

  onLayerContextMenu(pageId: string, id: string, event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.layerContextMenuRequested.emit({ pageId, id, x: event.clientX, y: event.clientY });
  }

  onLayerDragStart(pageId: string, id: string, event: DragEvent): void {
    this.draggedLayerId = id;
    this.draggedLayerPageId = pageId;
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', id);
    }
  }

  onLayerDragOver(pageId: string, layer: LayerEntry, event: DragEvent): void {
    if (
      !this.draggedLayerId ||
      this.draggedLayerId === layer.id ||
      this.draggedLayerPageId !== pageId
    ) {
      return;
    }

    const currentDraggedLayer = this.getLayerEntriesForPage(pageId).find(
      (entry) => entry.id === this.draggedLayerId,
    );
    if (!currentDraggedLayer || this.isInvalidLayerDrop(pageId, currentDraggedLayer, layer)) {
      return;
    }

    event.preventDefault();
    const bounds = (event.currentTarget as HTMLElement).getBoundingClientRect();
    this.dragOverLayerId = layer.id;
    this.dragOverLayerPageId = pageId;
    const relativeY = event.clientY - bounds.top;
    const sameParent = currentDraggedLayer.parentId === layer.parentId;

    if (this.canDropInside(pageId, currentDraggedLayer, layer)) {
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

  onLayerDrop(pageId: string, layer: LayerEntry, event: DragEvent): void {
    event.preventDefault();

    if (
      !this.draggedLayerId ||
      this.draggedLayerId === layer.id ||
      this.draggedLayerPageId !== pageId
    ) {
      this.clearDragState();
      return;
    }

    const currentDraggedLayer = this.getLayerEntriesForPage(pageId).find(
      (entry) => entry.id === this.draggedLayerId,
    );
    if (!currentDraggedLayer || this.isInvalidLayerDrop(pageId, currentDraggedLayer, layer)) {
      this.clearDragState();
      return;
    }

    this.layerMoved.emit({
      pageId,
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

  pageLayerHasChildren(pageId: string): boolean {
    return this.getLayerEntriesForPage(pageId).length > 0;
  }

  isPageLayerCollapsed(pageId: string): boolean {
    return this.collapsedPageLayers.has(pageId);
  }

  shouldShowPageLayerEntries(pageId: string): boolean {
    return this.getLayerEntriesForPage(pageId).length > 0 && !this.isPageLayerCollapsed(pageId);
  }

  togglePageLayerCollapse(pageId: string, event: MouseEvent): void {
    event.stopPropagation();
    if (this.collapsedPageLayers.has(pageId)) {
      this.collapsedPageLayers.delete(pageId);
    } else {
      this.collapsedPageLayers.add(pageId);
    }
  }

  toggleLayerCollapse(id: string, event: MouseEvent): void {
    event.stopPropagation();
    if (this.collapsedLayers.has(id)) {
      this.collapsedLayers.delete(id);
    } else {
      this.collapsedLayers.add(id);
    }
    this.rebuildLayerEntriesByPage();
  }

  isLayerDragging(pageId: string, id: string): boolean {
    return this.draggedLayerPageId === pageId && this.draggedLayerId === id;
  }

  isLayerDropTarget(pageId: string, id: string, position: LayerDropPosition): boolean {
    return (
      this.dragOverLayerPageId === pageId &&
      this.dragOverLayerId === id &&
      this.dragOverPosition === position
    );
  }

  getLayerEntriesForPage(pageId: string): LayerEntry[] {
    return this.cachedLayerEntriesByPage.get(pageId) ?? [];
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

  private rebuildLayerEntriesByPage(): void {
    this.cachedLayerEntriesByPage = new Map(
      this.pages.map((page) => [page.id, this.buildLayerEntries(page.elements, page.id)]),
    );
  }

  private buildLayerEntries(elements: CanvasElement[], pageId: string): LayerEntry[] {
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
          pageId,
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
    this.draggedLayerPageId = null;
    this.dragOverLayerId = null;
    this.dragOverLayerPageId = null;
    this.dragOverPosition = 'before';
  }

  private canDropInside(pageId: string, dragged: LayerEntry, target: LayerEntry): boolean {
    return (
      target.type === 'frame' &&
      dragged.type !== 'frame' &&
      !this.isDescendantOf(pageId, dragged.id, target.id)
    );
  }

  private isInvalidLayerDrop(pageId: string, dragged: LayerEntry, target: LayerEntry): boolean {
    return dragged.id === target.id || this.isDescendantOf(pageId, dragged.id, target.id);
  }

  private isDescendantOf(pageId: string, ancestorId: string, elementId: string): boolean {
    const parentById = new Map(
      this.getPageElements(pageId).map((element) => [element.id, element.parentId ?? null]),
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

  private getPageElements(pageId: string): CanvasElement[] {
    return this.pages.find((page) => page.id === pageId)?.elements ?? [];
  }
}
