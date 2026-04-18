import { CommonModule } from '@angular/common';
import {
  Component,
  EventEmitter,
  HostBinding,
  HostListener,
  Input,
  OnChanges,
  OnDestroy,
  OnInit,
  Output,
  SimpleChanges,
} from '@angular/core';
import { CanvasElement, CanvasElementType, CanvasPageModel } from '@app/core';
import { ContextMenuComponent, ToggleGroupComponent } from '@app/shared';
import type { ContextMenuItem, ToggleGroupOption } from '@app/shared';
import { DeviceFramePreset, VIEWPORT_PRESET_OPTIONS } from '../../canvas.types';
import { formatCanvasElementTypeLabel } from '../../utils/element/canvas-element-normalization.util';

interface LayerEntry {
  pageId: string;
  id: string;
  depth: number;
  type: CanvasElementType;
  typeLabel: string;
  parentId: string | null;
  name: string;
  visible: boolean;
  isEffectivelyHidden: boolean;
  hasChildren: boolean;
  hasLayout: boolean;
  hasImageFill: boolean;
  devicePreset: Exclude<DeviceFramePreset, 'custom'> | null;
}

type LayerDropPosition = 'before' | 'after' | 'inside';
type PageRenameSource = 'pages' | 'layers';
type PageMenuContext = 'pages' | 'layers';
type ProjectPanelTab = 'navigator' | 'ai-chat';

const DEFAULT_PANEL_WIDTH = 280;
const MIN_PANEL_WIDTH = 280;
const MAX_PANEL_WIDTH = 440;
const PANEL_VIEWPORT_GUTTER = 240;
const DEVICE_FRAME_PRESET_OPTIONS = VIEWPORT_PRESET_OPTIONS.filter(
  (
    option,
  ): option is {
    id: Exclude<DeviceFramePreset, 'custom'>;
    label: string;
    width: number;
    height: number;
  } => option.id === 'desktop' || option.id === 'tablet' || option.id === 'mobile',
);

@Component({
  selector: 'app-project-panel',
  standalone: true,
  imports: [CommonModule, ContextMenuComponent, ToggleGroupComponent],
  templateUrl: './project-panel.component.html',
  styleUrl: './project-panel.component.css',
})
export class ProjectPanelComponent implements OnChanges, OnInit, OnDestroy {
  @HostBinding('style.width.px') panelWidth = DEFAULT_PANEL_WIDTH;
  @HostBinding('class.is-resizing') isResizingPanel = false;

  @Input() pages: CanvasPageModel[] = [];
  @Input() currentPageId: string | null = null;
  @Input() focusedPageId: string | null = null;
  @Input() selectedPageLayerId: string | null = null;
  @Input() canPastePage = false;
  @Input() elements: CanvasElement[] = [];
  @Input() selectedElementId: string | null = null;
  @Input() selectedElementIds: string[] = [];

  @Output() panelWidthChanged = new EventEmitter<number>();
  @Output() pageSelected = new EventEmitter<string>();
  @Output() pageLayerSelected = new EventEmitter<string>();
  @Output() pageCreateRequested = new EventEmitter<void>();
  @Output() pageCopyRequested = new EventEmitter<string>();
  @Output() pagePasteRequested = new EventEmitter<string>();
  @Output() pageDuplicateRequested = new EventEmitter<string>();
  @Output() pageDeleteRequested = new EventEmitter<string>();
  @Output() pageNameChanged = new EventEmitter<{ id: string; name: string }>();
  @Output() layerSelected = new EventEmitter<{ pageId: string; id: string; additive: boolean }>();
  @Output() layerNameChanged = new EventEmitter<{ pageId: string; id: string; name: string }>();
  @Output() layerVisibilityToggled = new EventEmitter<{ pageId: string; id: string }>();
  @Output() layerMoved = new EventEmitter<{
    pageId: string;
    draggedId: string;
    targetId: string | null;
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
  editingLayerName = '';
  editingPageId: string | null = null;
  pageMenuPageId: string | null = null;
  pageMenuItems: ContextMenuItem[] = [];
  pageMenuX = 0;
  pageMenuY = 0;
  activeTab: ProjectPanelTab = 'navigator';
  readonly panelTabOptions: readonly ToggleGroupOption[] = [
    {
      label: 'Navigator',
      value: 'navigator',
      ariaLabel: 'Open navigator tab',
      title: 'Navigator',
    },
    {
      label: 'AI Chat',
      value: 'ai-chat',
      ariaLabel: 'Open AI chat tab',
      title: 'AI Chat',
    },
  ];
  private pageMenuContext: PageMenuContext | null = null;
  private editingPageName = '';
  private editingPageSource: PageRenameSource | null = null;
  private resizeStartX = 0;
  private resizeStartWidth = DEFAULT_PANEL_WIDTH;
  private readonly renameRequestListener: EventListener = (event) => {
    const renameEvent = event as CustomEvent<{ id?: string }>;
    const layerId = renameEvent.detail?.id;
    if (!layerId || !this.findLayerEntryById(layerId)) {
      return;
    }

    this.startRename(layerId);
  };

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

  ngOnInit(): void {
    window.addEventListener('canvas:rename-request', this.renameRequestListener);
    this.panelWidthChanged.emit(this.panelWidth);
  }

  ngOnDestroy(): void {
    window.removeEventListener('canvas:rename-request', this.renameRequestListener);
    this.stopPanelResize();
  }

  onTabValueChange(value: string | number | boolean): void {
    if (value === 'navigator' || value === 'ai-chat') {
      this.activeTab = value;
      this.closePageMenu();
    }
  }

  @HostListener('window:pointermove', ['$event'])
  onWindowPointerMove(event: PointerEvent): void {
    if (!this.isResizingPanel) {
      return;
    }

    event.preventDefault();
    const deltaX = event.clientX - this.resizeStartX;
    const nextWidth = this.clampPanelWidth(this.resizeStartWidth + deltaX);
    if (nextWidth === this.panelWidth) {
      return;
    }

    this.panelWidth = nextWidth;
    this.panelWidthChanged.emit(this.panelWidth);
  }

  @HostListener('window:pointerup')
  onWindowPointerUp(): void {
    this.stopPanelResize();
  }

  onPageSelect(pageId: string): void {
    this.closePageMenu();
    this.pageSelected.emit(pageId);
  }

  onLayerPageSelect(pageId: string): void {
    this.closePageMenu();
    this.pageLayerSelected.emit(pageId);
  }

  onResizeHandlePointerDown(event: PointerEvent): void {
    event.preventDefault();
    event.stopPropagation();

    this.isResizingPanel = true;
    this.resizeStartX = event.clientX;
    this.resizeStartWidth = this.panelWidth;
    document.body.style.cursor = 'ew-resize';
    document.body.style.userSelect = 'none';
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

  onLayerSelected(pageId: string, id: string, event?: MouseEvent): void {
    this.closePageMenu();
    this.layerSelected.emit({ pageId, id, additive: !!event?.shiftKey });
  }

  onLayerNameInput(event: Event): void {
    this.editingLayerName = (event.target as HTMLInputElement).value;
  }

  onLayerNameClick(pageId: string, id: string, event: MouseEvent): void {
    event.stopPropagation();
    if (this.editingLayerId !== id) {
      this.layerSelected.emit({ pageId, id, additive: event.shiftKey });
    }
  }

  isLayerSelected(id: string): boolean {
    return this.selectedElementIds.includes(id) || this.selectedElementId === id;
  }

  startRename(id: string, event?: MouseEvent): void {
    event?.stopPropagation();
    this.editingLayerName = this.findLayerEntryById(id)?.name ?? '';
    this.editingLayerId = id;
    setTimeout(() => {
      const input = document.querySelector<HTMLInputElement>(`[data-layer-name-id="${id}"]`);
      input?.select();
    });
  }

  stopRename(pageId: string, id: string): void {
    if (this.editingLayerId !== id) {
      return;
    }

    const trimmed = this.editingLayerName.trim();
    if (trimmed) {
      this.layerNameChanged.emit({ pageId, id, name: trimmed });
    }

    this.clearLayerRename();
  }

  onLayerNameKeyDown(id: string, event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      event.preventDefault();
      (event.target as HTMLInputElement).blur();
      return;
    }

    if (event.key === 'Escape' && this.editingLayerId === id) {
      event.preventDefault();
      this.clearLayerRename();
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

  private clearLayerRename(): void {
    this.editingLayerId = null;
    this.editingLayerName = '';
  }

  private stopPanelResize(): void {
    if (!this.isResizingPanel) {
      return;
    }

    this.isResizingPanel = false;
    document.body.style.removeProperty('cursor');
    document.body.style.removeProperty('user-select');
  }

  private clampPanelWidth(width: number): number {
    const maxWidth = Math.max(
      MIN_PANEL_WIDTH,
      Math.min(MAX_PANEL_WIDTH, window.innerWidth - PANEL_VIEWPORT_GUTTER),
    );

    return Math.min(Math.max(width, MIN_PANEL_WIDTH), maxWidth);
  }

  private findLayerEntryById(id: string): LayerEntry | null {
    for (const entries of this.cachedLayerEntriesByPage.values()) {
      const match = entries.find((entry) => entry.id === id);
      if (match) {
        return match;
      }
    }

    return null;
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

    if (this.canDropInside(pageId, currentDraggedLayer, layer)) {
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

  onPageLayerDragOver(pageId: string, event: DragEvent): void {
    if (!this.draggedLayerId || this.draggedLayerPageId !== pageId) {
      return;
    }

    event.preventDefault();
    this.dragOverLayerId = null;
    this.dragOverLayerPageId = pageId;
    this.dragOverPosition = 'inside';
  }

  onPageLayerDrop(pageId: string, event: DragEvent): void {
    event.preventDefault();

    if (!this.draggedLayerId || this.draggedLayerPageId !== pageId) {
      this.clearDragState();
      return;
    }

    this.layerMoved.emit({
      pageId,
      draggedId: this.draggedLayerId,
      targetId: null,
      position: 'inside',
    });

    this.clearDragState();
  }

  isLayerCollapsed(id: string): boolean {
    return this.collapsedLayers.has(id);
  }

  pageLayerHasChildren(pageId: string): boolean {
    return this.getLayerEntriesForPage(pageId).length > 0;
  }

  pageLayerHasActiveLayout(pageId: string): boolean {
    return this.getLayerEntriesForPage(pageId).some(
      (entry) => entry.depth === 0 && entry.hasLayout,
    );
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

  isPageRootDropTarget(pageId: string): boolean {
    return (
      this.dragOverLayerPageId === pageId &&
      this.dragOverLayerId === null &&
      this.dragOverPosition === 'inside'
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

  usesFilledRectangleLayerIcon(layer: LayerEntry): boolean {
    return layer.type === 'rectangle' && layer.hasChildren && !layer.hasLayout;
  }

  usesImageLayerIcon(layer: LayerEntry): boolean {
    return layer.hasImageFill;
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

    const walk = (parentId: string | null, depth: number, isAncestorHidden: boolean) => {
      const children = childrenByParent.get(parentId) ?? [];
      for (const child of children) {
        if (seen.has(child.id)) {
          continue;
        }

        seen.add(child.id);
        const nextTypeCount = (typeCounters.get(child.type) ?? 0) + 1;
        typeCounters.set(child.type, nextTypeCount);

        const typeLabel = formatCanvasElementTypeLabel(child.type);
        const fallbackName =
          child.type === 'rectangle' ||
          child.type === 'text' ||
          child.type === 'image' ||
          child.type === 'frame'
            ? typeLabel
            : `${typeLabel} ${nextTypeCount}`;

        const isVisible = child.visible !== false;
        const isEffectivelyHidden = isAncestorHidden || !isVisible;

        entries.push({
          pageId,
          id: child.id,
          depth,
          type: child.type,
          typeLabel,
          parentId: child.parentId ?? null,
          name: typeof child.name === 'string' ? child.name : fallbackName,
          visible: isVisible,
          isEffectivelyHidden,
          hasChildren: (childrenByParent.get(child.id)?.length ?? 0) > 0,
          hasLayout: !!child.display,
          hasImageFill: child.fillMode === 'image',
          devicePreset: this.getDeviceFramePreset(child),
        });

        if (!this.collapsedLayers.has(child.id)) {
          walk(child.id, depth + 1, isEffectivelyHidden);
        }
      }
    };

    walk(null, 0, false);
    return entries;
  }

  private getDeviceFramePreset(
    element: CanvasElement,
  ): Exclude<DeviceFramePreset, 'custom'> | null {
    if (element.type !== 'frame' || element.parentId) {
      return null;
    }

    const normalizedName = (element.name ?? '').trim().toLowerCase();
    if (normalizedName.startsWith('desktop')) {
      return 'desktop';
    }

    if (normalizedName.startsWith('tablet')) {
      return 'tablet';
    }

    if (normalizedName.startsWith('mobile')) {
      return 'mobile';
    }

    const roundedWidth = Math.round(element.width);
    const matchedPreset = DEVICE_FRAME_PRESET_OPTIONS.find(
      (option) => option.width === roundedWidth,
    );
    return matchedPreset?.id ?? null;
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
      this.canContainLayers(target) &&
      dragged.type !== 'frame' &&
      !this.isDescendantOf(pageId, dragged.id, target.id)
    );
  }

  private canContainLayers(layer: LayerEntry): boolean {
    return layer.type === 'frame' || layer.type === 'rectangle';
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
