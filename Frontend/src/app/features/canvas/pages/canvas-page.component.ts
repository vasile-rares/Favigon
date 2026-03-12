import {
  Component,
  HostListener,
  OnDestroy,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import {
  CanvasElement,
  CanvasElementType,
  CanvasPageModel,
  CanvasProjectDocument,
  CanvasStrokePosition,
} from '../../../core/models/canvas.models';
import { buildCanvasIR, buildCanvasProjectDocument } from '../../../core/mappers/canvas-ir.mapper';
import { HeaderBarComponent } from '../../../shared/components/header-bar/header-bar.component';
import { ToolbarComponent } from '../components/toolbar/toolbar.component';
import { ProjectPanelComponent } from '../components/project-panel/project-panel.component';
import { PropertiesPanelComponent } from '../components/properties-panel/properties-panel.component';
import { IRNode } from '../../../core/models/ir.models';
import { extractApiErrorMessage } from '../../../core/utils/api-error.util';
import {
  clamp,
  getStrokePosition,
  getStrokeWidth,
  isPointInsideElement,
  normalizeElementInPlace,
  removeWithChildren,
  roundToTwoDecimals,
} from '../../../core/utils/canvas-interaction.util';
import { formatCanvasElementTypeLabel } from '../../../core/utils/canvas-label.util';
import { CanvasGenerationService } from '../../../core/services/canvas-generation.service';
import { CanvasPersistenceService } from '../../../core/services/canvas-persistence.service';
import {
  ContextMenuComponent,
  ContextMenuItem,
} from '../../../shared/components/context-menu/context-menu.component';

type SupportedFramework = 'html' | 'react' | 'angular';
type HandlePosition = 'nw' | 'ne' | 'sw' | 'se' | 'n' | 's' | 'e' | 'w';
type CornerHandle = 'nw' | 'ne' | 'sw' | 'se';
type EdgeHandle = 'n' | 's' | 'e' | 'w';

interface FrameTemplateSelection {
  name: string;
  sizeLabel: string;
  width: number;
  height: number;
}

interface Point {
  x: number;
  y: number;
}

interface Bounds extends Point {
  width: number;
  height: number;
}

interface ResizeState {
  pointerX: number;
  pointerY: number;
  width: number;
  height: number;
  absoluteX: number;
  absoluteY: number;
  centerX: number;
  centerY: number;
  aspectRatio: number;
  elementId: string;
  handle: HandlePosition;
}

interface RotateState {
  startAngle: number;
  initialRotation: number;
  centerX: number;
  centerY: number;
  elementId: string;
}

interface HistorySnapshot {
  pages: CanvasPageModel[];
  currentPageId: string | null;
  selectedElementId: string | null;
}

interface CanvasClipboardSnapshot {
  rootId: string;
  sourcePageId: string | null;
  pasteCount: number;
  elements: CanvasElement[];
}

@Component({
  selector: 'app-canvas-page',
  standalone: true,
  imports: [
    CommonModule,
    HeaderBarComponent,
    ToolbarComponent,
    ProjectPanelComponent,
    PropertiesPanelComponent,
    ContextMenuComponent,
  ],
  templateUrl: './canvas-page.component.html',
  styleUrl: './canvas-page.component.css',
})
export class ProjectPage implements OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly canvasGenerationService = inject(CanvasGenerationService);
  private readonly canvasPersistenceService = inject(CanvasPersistenceService);

  readonly pages = signal<CanvasPageModel[]>([this.createPage('Page 1')]);
  readonly currentPageId = signal<string | null>(this.pages()[0]?.id ?? null);
  readonly selectedElementId = signal<string | null>(null);
  readonly editingTextElementId = signal<string | null>(null);
  readonly currentTool = signal<CanvasElementType | 'select'>('select');
  readonly zoomLevel = signal(1);
  readonly viewportOffset = signal({ x: 0, y: 0 });
  readonly isPanning = signal(false);
  readonly isSpacePressed = signal(false);
  readonly frameTemplate = signal({ width: 390, height: 844 });

  readonly currentPage = computed<CanvasPageModel | null>(() => {
    const activePageId = this.currentPageId();
    if (!activePageId) {
      return this.pages()[0] ?? null;
    }

    return this.pages().find((page) => page.id === activePageId) ?? this.pages()[0] ?? null;
  });

  readonly elements = computed<CanvasElement[]>(() => this.currentPage()?.elements ?? []);

  readonly selectedElement = computed<CanvasElement | null>(() => {
    const selectedId = this.selectedElementId();
    if (!selectedId) {
      return null;
    }

    return this.elements().find((element) => element.id === selectedId) ?? null;
  });

  readonly visibleElements = computed<CanvasElement[]>(() =>
    this.elements().filter((element) => this.isElementEffectivelyVisible(element.id)),
  );

  readonly selectedFramework = signal<SupportedFramework>('html');
  readonly validationResult = signal<boolean | null>(null);
  readonly apiError = signal<string | null>(null);
  readonly isValidating = signal(false);
  readonly isGenerating = signal(false);
  readonly generatedHtml = signal('');
  readonly generatedCss = signal('');
  readonly isLoadingDesign = signal(false);
  readonly isSavingDesign = signal(false);
  readonly lastSavedAt = signal<string | null>(null);

  readonly isContextMenuOpen = signal(false);
  readonly contextMenuX = signal(0);
  readonly contextMenuY = signal(0);
  readonly contextMenuItems = signal<ContextMenuItem[]>([]);

  readonly projectId = this.route.snapshot.paramMap.get('id') ?? 'new-project';
  readonly irPreview = computed<IRNode>(() => {
    const currentPage = this.currentPage();
    return buildCanvasIR(this.visibleElements(), this.projectId, currentPage?.name);
  });

  readonly currentPageName = computed(() => this.currentPage()?.name ?? 'Untitled page');
  readonly cornerHandles: CornerHandle[] = ['nw', 'ne', 'sw', 'se'];

  private readonly projectIdAsNumber = Number.parseInt(this.projectId, 10);
  private readonly imagePlaceholderUrl = 'https://placehold.co/300x200?text=Image';
  private readonly defaultFrameFill = '#ffffff';
  private readonly defaultElementFill = '#e0e0e0';
  private readonly minZoom = 0.25;
  private readonly maxZoom = 3;
  private readonly zoomStep = 0.1;
  private readonly gridSize = 20;
  private readonly minElementSize = 24;
  private readonly frameInsertGap = 48;
  private readonly maxHistorySteps = 10;
  private readonly clipboardPasteOffset = 24;

  private canPersistDesign = false;
  private saveTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private panStart = { x: 0, y: 0 };
  private panMoved = false;
  private suppressNextCanvasClick = false;
  private dragOffset = { x: 0, y: 0 };
  private isDragging = false;
  private isResizing = false;
  private isRotating = false;
  private isApplyingHistory = false;
  private undoStack: HistorySnapshot[] = [];
  private redoStack: HistorySnapshot[] = [];
  private pendingGestureHistorySnapshot: HistorySnapshot | null = null;
  private pendingTextEditHistorySnapshot: HistorySnapshot | null = null;
  private clipboardSnapshot: CanvasClipboardSnapshot | null = null;
  private resizeStart: ResizeState = {
    pointerX: 0,
    pointerY: 0,
    width: 0,
    height: 0,
    absoluteX: 0,
    absoluteY: 0,
    centerX: 0,
    centerY: 0,
    aspectRatio: 1,
    elementId: '',
    handle: 'se',
  };

  private rotateStart: RotateState = {
    startAngle: 0,
    initialRotation: 0,
    centerX: 0,
    centerY: 0,
    elementId: '',
  };

  constructor() {
    this.loadProjectDesign();

    effect(() => {
      this.pages();
      this.currentPageId();

      if (!this.canPersistDesign) {
        return;
      }

      this.scheduleDesignSave();
    });
  }

  ngOnDestroy(): void {
    if (this.saveTimeoutId) {
      clearTimeout(this.saveTimeoutId);
      this.saveTimeoutId = null;
    }
  }

  selectTool(tool: CanvasElementType | 'select'): void {
    this.currentTool.set(tool);
    if (tool === 'select') {
      return;
    }

    const selected = this.selectedElement();
    const shouldKeepSelection = tool !== 'frame' && selected?.type === 'frame';

    if (!shouldKeepSelection) {
      this.selectedElementId.set(null);
    }
  }

  addPage(): void {
    this.runWithHistory(() => {
      const page = this.createPage(this.getNextPageName());
      this.pages.update((pages) => [...pages, page]);
      this.currentPageId.set(page.id);
      this.selectedElementId.set(null);
    });
  }

  selectPage(pageId: string): void {
    if (pageId === this.currentPageId()) {
      return;
    }

    this.currentPageId.set(pageId);
    this.selectedElementId.set(null);
    this.currentTool.set('select');
  }

  deletePage(pageId: string): void {
    const pages = this.pages();
    if (pages.length <= 1) {
      this.apiError.set('A project must contain at least one page.');
      return;
    }

    const page = pages.find((entry) => entry.id === pageId);
    if (!page) {
      return;
    }

    const shouldDelete = window.confirm(`Delete page "${page.name}"?`);
    if (!shouldDelete) {
      return;
    }

    this.apiError.set(null);

    this.runWithHistory(() => {
      const currentPages = this.pages();
      const pageIndex = currentPages.findIndex((entry) => entry.id === pageId);
      const nextPages = currentPages.filter((entry) => entry.id !== pageId);
      const fallbackPage =
        nextPages[Math.min(pageIndex, nextPages.length - 1)] ?? nextPages[0] ?? null;

      this.pages.set(nextPages);
      if (this.currentPageId() === pageId) {
        this.currentPageId.set(fallbackPage?.id ?? null);
      }

      this.selectedElementId.set(null);
      this.editingTextElementId.set(null);
      this.currentTool.set('select');
    });
  }

  onCanvasPointerDown(event: MouseEvent): void {
    const target = event.target as HTMLElement;
    if (!this.shouldStartPanning(event, target)) {
      return;
    }

    this.startPanning(event);
  }

  onCanvasClick(event: MouseEvent): void {
    if (this.suppressNextCanvasClick) {
      this.suppressNextCanvasClick = false;
      return;
    }

    if (this.isSpacePressed()) {
      return;
    }

    this.apiError.set(null);
    const tool = this.currentTool();
    if (tool === 'select') {
      const target = event.target as HTMLElement;
      if (
        target.classList.contains('canvas-container') ||
        target.classList.contains('canvas-viewport')
      ) {
        this.selectedElementId.set(null);
      }

      return;
    }

    const pointer = this.getCanvasPoint(event);
    if (!pointer) {
      return;
    }

    const newElement = this.createElementAtPoint(tool, pointer);
    if (!newElement) {
      return;
    }

    this.runWithHistory(() => {
      this.updateCurrentPageElements((elements) => [...elements, newElement]);
      this.selectedElementId.set(newElement.id);
      this.currentTool.set('select');
    });
  }

  onElementPointerDown(event: MouseEvent, id: string): void {
    const target = event.target as HTMLElement;
    if (this.shouldStartPanning(event, target)) {
      this.startPanning(event);
      return;
    }

    if (this.isResizing || this.isRotating || this.editingTextElementId() === id) {
      return;
    }

    event.stopPropagation();
    this.selectedElementId.set(id);

    if (this.currentTool() !== 'select') {
      const selectedFrame = this.getSelectedFrame();
      const clickedElement = this.findElementById(id);
      if (
        selectedFrame &&
        clickedElement?.id === selectedFrame.id &&
        clickedElement.type === 'frame'
      ) {
        return;
      }

      this.currentTool.set('select');
      return;
    }

    const element = this.findElementById(id);
    if (!element) {
      return;
    }

    const pointer = this.getCanvasPoint(event);
    if (!pointer) {
      return;
    }

    const bounds = this.getAbsoluteBounds(element);
    this.beginGestureHistory();
    this.isDragging = true;
    this.dragOffset = {
      x: pointer.x - bounds.x,
      y: pointer.y - bounds.y,
    };
  }

  onElementDoubleClick(event: MouseEvent, id: string): void {
    event.stopPropagation();

    const element = this.findElementById(id);
    if (element?.type !== 'text') {
      return;
    }

    this.selectedElementId.set(id);
    this.editingTextElementId.set(id);
    this.focusInlineTextEditor(id);
  }

  onTextEditorPointerDown(event: MouseEvent): void {
    event.stopPropagation();
  }

  onTextEditorInput(id: string, event: Event): void {
    this.beginTextEditHistory();
    const value = (event.target as HTMLTextAreaElement).value;
    this.updateCurrentPageElements((elements) =>
      elements.map((element) =>
        element.id === id
          ? {
              ...element,
              text: value,
            }
          : element,
      ),
    );
  }

  onTextEditorBlur(id: string): void {
    this.commitTextEditHistory();
    if (this.editingTextElementId() === id) {
      this.editingTextElementId.set(null);
    }
  }

  onTextEditorKeyDown(event: KeyboardEvent, id: string): void {
    event.stopPropagation();

    if (event.key !== 'Escape') {
      return;
    }

    event.preventDefault();
    this.commitTextEditHistory();
    this.editingTextElementId.set(null);
    if (this.selectedElementId() !== id) {
      this.selectedElementId.set(id);
    }
    (event.target as HTMLTextAreaElement | null)?.blur();
  }

  onResizeHandlePointerDown(event: MouseEvent, id: string, handle: HandlePosition): void {
    event.stopPropagation();
    event.preventDefault();

    const element = this.findElementById(id);
    if (!element) {
      return;
    }

    const pointer = this.getCanvasPoint(event);
    if (!pointer) {
      return;
    }

    const bounds = this.getAbsoluteBounds(element);

    this.selectedElementId.set(id);
    this.beginGestureHistory();
    this.isDragging = false;
    this.isResizing = true;
    this.resizeStart = {
      pointerX: pointer.x,
      pointerY: pointer.y,
      width: element.width,
      height: element.height,
      absoluteX: bounds.x,
      absoluteY: bounds.y,
      centerX: bounds.x + element.width / 2,
      centerY: bounds.y + element.height / 2,
      aspectRatio: element.width / Math.max(element.height, 1),
      elementId: id,
      handle,
    };
  }

  onCornerZonePointerDown(event: MouseEvent, id: string, _corner: CornerHandle): void {
    event.stopPropagation();
    event.preventDefault();

    const element = this.findElementById(id);
    if (!element) {
      return;
    }

    const pointer = this.getCanvasPoint(event);
    if (!pointer) {
      return;
    }

    const bounds = this.getAbsoluteBounds(element);
    const cx = bounds.x + element.width / 2;
    const cy = bounds.y + element.height / 2;
    const startAngle = Math.atan2(pointer.y - cy, pointer.x - cx) * (180 / Math.PI);

    this.selectedElementId.set(id);
    this.beginGestureHistory();
    this.isDragging = false;
    this.isResizing = false;
    this.isRotating = true;
    this.rotateStart = {
      startAngle,
      initialRotation: element.rotation ?? 0,
      centerX: cx,
      centerY: cy,
      elementId: id,
    };
  }

  onSelectedElementPatch(patch: Partial<CanvasElement>): void {
    const selectedId = this.selectedElementId();
    if (!selectedId) {
      return;
    }

    this.runWithHistory(() => {
      this.updateCurrentPageElements((elements) =>
        elements.map((element) => {
          if (element.id !== selectedId) {
            return element;
          }

          const nextElement: CanvasElement = {
            ...element,
            ...patch,
          };

          this.normalizeElement(nextElement, elements);
          return nextElement;
        }),
      );
    });
  }

  onLayerSelected(elementId: string): void {
    this.selectedElementId.set(elementId);
    this.currentTool.set('select');
  }

  onLayerNameChanged(change: { id: string; name: string }): void {
    this.runWithHistory(() => {
      this.updateCurrentPageElements((elements) =>
        elements.map((element) =>
          element.id === change.id
            ? {
                ...element,
                name: change.name,
              }
            : element,
        ),
      );
    });
  }

  onLayerVisibilityToggled(elementId: string): void {
    this.runWithHistory(() => {
      this.updateCurrentPageElements((elements) =>
        elements.map((element) =>
          element.id === elementId
            ? {
                ...element,
                visible: element.visible === false,
              }
            : element,
        ),
      );
    });
  }

  onLayerMoved(change: {
    draggedId: string;
    targetId: string;
    position: 'before' | 'after' | 'inside';
  }): void {
    this.runWithHistory(() => {
      this.updateCurrentPageElements((elements) =>
        this.reorderLayerElements(elements, change.draggedId, change.targetId, change.position),
      );
    });
  }

  onFrameTemplateSelected(template: FrameTemplateSelection): void {
    this.frameTemplate.set({
      width: template.width,
      height: template.height,
    });

    const centerPoint = this.getViewportCenterCanvasPoint();
    const frame = this.createFrameAtCenter(
      centerPoint,
      template.width,
      template.height,
      template.name,
    );

    this.runWithHistory(() => {
      this.updateCurrentPageElements((elements) => [...elements, frame]);
      this.selectedElementId.set(frame.id);
      this.currentTool.set('select');
    });
    this.focusElement(frame);
  }

  setFramework(framework: SupportedFramework): void {
    this.selectedFramework.set(framework);
  }

  onCanvasContextMenu(event: MouseEvent): void {
    event.preventDefault();
    this.openContextMenu(event.clientX, event.clientY);
  }

  onElementContextMenu(event: MouseEvent, id: string): void {
    event.preventDefault();
    event.stopPropagation();
    this.selectedElementId.set(id);
    this.openContextMenu(event.clientX, event.clientY);
  }

  onLayerContextMenuRequested(event: { id: string; x: number; y: number }): void {
    this.selectedElementId.set(event.id);
    this.openContextMenu(event.x, event.y);
  }

  closeContextMenu(): void {
    this.isContextMenuOpen.set(false);
    this.contextMenuItems.set([]);
  }

  private openContextMenu(x: number, y: number): void {
    this.contextMenuItems.set(this.buildContextMenuItems());
    this.contextMenuX.set(x);
    this.contextMenuY.set(y);
    this.isContextMenuOpen.set(true);
  }

  private buildContextMenuItems(): ContextMenuItem[] {
    const el = this.selectedElement();
    const hasEl = !!el;
    const isVisible = el?.visible !== false;
    const otherPages = this.pages().filter((p) => p.id !== this.currentPageId());

    return [
      // Clipboard group
      {
        id: 'copy',
        label: 'Copy',
        shortcut: 'Ctrl+C',
        disabled: !hasEl,
        action: () => this.ctxCopy(),
      },
      {
        id: 'paste',
        label: 'Paste',
        shortcut: 'Ctrl+V',
        action: () => this.ctxPaste(),
      },
      {
        id: 'delete',
        label: 'Delete',
        shortcut: 'Del',
        variant: 'danger' as const,
        disabled: !hasEl,
        action: () => this.ctxDelete(),
      },

      // Order group
      {
        id: 'bring-front',
        label: 'Bring to Front',
        shortcut: 'Ctrl+]',
        disabled: !hasEl,
        separator: true,
        action: () => this.ctxBringToFront(),
      },
      {
        id: 'send-back',
        label: 'Send to Back',
        shortcut: 'Ctrl+[',
        disabled: !hasEl,
        action: () => this.ctxSendToBack(),
      },
      {
        id: 'move-to-page',
        label: 'Move to Page',
        disabled: !hasEl || otherPages.length === 0,
        children: otherPages.map((p) => ({
          id: `move-page-${p.id}`,
          label: p.name,
          action: () => this.ctxMoveToPage(p.id),
        })),
      },

      // Transform group
      {
        id: 'flip-h',
        label: 'Flip Horizontal',
        disabled: !hasEl,
        separator: true,
        action: () => this.ctxFlipHorizontal(),
      },
      {
        id: 'flip-v',
        label: 'Flip Vertical',
        disabled: !hasEl,
        action: () => this.ctxFlipVertical(),
      },

      // Element group
      {
        id: 'rename',
        label: 'Rename',
        shortcut: 'F2',
        disabled: !hasEl,
        separator: true,
        action: () => this.ctxRename(),
      },
      {
        id: 'visibility',
        label: isVisible ? 'Hide' : 'Show',
        shortcut: 'Ctrl+Shift+H',
        disabled: !hasEl,
        action: () => this.ctxToggleVisibility(),
      },
    ];
  }

  private ctxCopy(): void {
    this.copySelectedElement();
  }

  private ctxPaste(): void {
    this.pasteClipboard();
  }

  private ctxDelete(): void {
    const selectedId = this.selectedElementId();
    if (!selectedId) return;
    this.runWithHistory(() => {
      this.updateCurrentPageElements((elements) => this.removeWithChildren(elements, selectedId));
      this.selectedElementId.set(null);
    });
  }

  private ctxBringToFront(): void {
    const selectedId = this.selectedElementId();
    if (!selectedId) return;
    this.runWithHistory(() => {
      this.updateCurrentPageElements((elements) => {
        const index = elements.findIndex((el) => el.id === selectedId);
        if (index === -1) return elements;
        const next = [...elements];
        const [moved] = next.splice(index, 1);
        next.push(moved);
        return next;
      });
    });
  }

  private ctxSendToBack(): void {
    const selectedId = this.selectedElementId();
    if (!selectedId) return;
    this.runWithHistory(() => {
      this.updateCurrentPageElements((elements) => {
        const el = elements.find((e) => e.id === selectedId);
        if (!el) return elements;

        const withoutEl = elements.filter((e) => e.id !== selectedId);
        const parentId = el.parentId ?? null;

        // Elements inside a frame: move to the start of their siblings
        if (parentId !== null || el.type === 'frame') {
          const firstSiblingIdx = withoutEl.findIndex((e) => (e.parentId ?? null) === parentId);
          const insertAt = firstSiblingIdx === -1 ? 0 : firstSiblingIdx;
          const result = [...withoutEl];
          result.splice(insertAt, 0, el);
          return result;
        }

        // Top-level non-frame: place just after the last top-level frame
        // so it stays above frames but is at the back of non-frame elements
        let lastFrameIdx = -1;
        for (let i = 0; i < withoutEl.length; i++) {
          if (withoutEl[i].type === 'frame' && !withoutEl[i].parentId) {
            lastFrameIdx = i;
          }
        }

        const insertAt = lastFrameIdx + 1;
        const result = [...withoutEl];
        result.splice(insertAt, 0, el);
        return result;
      });
    });
  }

  private ctxMoveToPage(targetPageId: string): void {
    const selectedId = this.selectedElementId();
    if (!selectedId) return;
    const subtreeIds = new Set(this.collectSubtreeIds(this.elements(), selectedId));
    const elementsToMove = this.elements().filter((el) => subtreeIds.has(el.id));
    if (elementsToMove.length === 0) return;
    this.runWithHistory(() => {
      this.updateCurrentPageElements((elements) => elements.filter((el) => !subtreeIds.has(el.id)));
      this.pages.update((pages) =>
        pages.map((page) =>
          page.id === targetPageId
            ? { ...page, elements: [...page.elements, ...elementsToMove] }
            : page,
        ),
      );
      this.selectedElementId.set(null);
    });
  }

  private ctxFlipHorizontal(): void {
    const selectedId = this.selectedElementId();
    if (!selectedId) return;
    this.runWithHistory(() => {
      this.updateCurrentPageElements((elements) =>
        elements.map((el) => {
          if (el.id !== selectedId) return el;
          const currentScale = (el as CanvasElement & { scaleX?: number }).scaleX ?? 1;
          return { ...el, scaleX: currentScale === -1 ? 1 : -1 } as CanvasElement;
        }),
      );
    });
  }

  private ctxFlipVertical(): void {
    const selectedId = this.selectedElementId();
    if (!selectedId) return;
    this.runWithHistory(() => {
      this.updateCurrentPageElements((elements) =>
        elements.map((el) => {
          if (el.id !== selectedId) return el;
          const currentScale = (el as CanvasElement & { scaleY?: number }).scaleY ?? 1;
          return { ...el, scaleY: currentScale === -1 ? 1 : -1 } as CanvasElement;
        }),
      );
    });
  }

  private ctxRename(): void {
    const selectedId = this.selectedElementId();
    if (!selectedId) return;
    window.dispatchEvent(new CustomEvent('canvas:rename-request', { detail: { id: selectedId } }));
  }

  private ctxToggleVisibility(): void {
    const selectedId = this.selectedElementId();
    if (!selectedId) return;
    this.onLayerVisibilityToggled(selectedId);
  }

  @HostListener('window:pointermove', ['$event'])
  onPointerMove(event: MouseEvent): void {
    if (this.isPanning()) {
      const deltaX = event.clientX - this.panStart.x;
      const deltaY = event.clientY - this.panStart.y;

      if (deltaX !== 0 || deltaY !== 0) {
        this.panMoved = true;
        this.viewportOffset.update((offset) => ({
          x: this.roundToTwoDecimals(offset.x + deltaX),
          y: this.roundToTwoDecimals(offset.y + deltaY),
        }));
        this.panStart = { x: event.clientX, y: event.clientY };
      }

      return;
    }

    if (this.isRotating) {
      this.handleRotatePointerMove(event);
      return;
    }

    if (this.isResizing) {
      this.handleResizePointerMove(event);
      return;
    }

    if (!this.isDragging) {
      return;
    }

    const selectedId = this.selectedElementId();
    if (!selectedId) {
      return;
    }

    const pointer = this.getCanvasPoint(event);
    if (!pointer) {
      return;
    }

    this.updateCurrentPageElements((elements) =>
      elements.map((element) => {
        if (element.id !== selectedId) {
          return element;
        }

        const absoluteX = pointer.x - this.dragOffset.x;
        const absoluteY = pointer.y - this.dragOffset.y;

        if (element.type === 'frame') {
          return {
            ...element,
            x: this.roundToTwoDecimals(absoluteX),
            y: this.roundToTwoDecimals(absoluteY),
          };
        }

        const parent = this.findElementById(element.parentId ?? null, elements);
        if (!parent) {
          return {
            ...element,
            x: this.roundToTwoDecimals(absoluteX),
            y: this.roundToTwoDecimals(absoluteY),
          };
        }

        const parentBounds = this.getAbsoluteBounds(parent, elements);
        return {
          ...element,
          x: this.clamp(absoluteX - parentBounds.x, 0, parent.width - element.width),
          y: this.clamp(absoluteY - parentBounds.y, 0, parent.height - element.height),
        };
      }),
    );
  }

  @HostListener('window:pointerup')
  onPointerUp(): void {
    const shouldCommitGestureHistory = this.isDragging || this.isResizing || this.isRotating;

    if (this.isPanning() && this.panMoved) {
      this.suppressNextCanvasClick = true;
    }

    this.isPanning.set(false);
    this.isDragging = false;
    this.isResizing = false;
    this.isRotating = false;

    if (shouldCommitGestureHistory) {
      this.commitGestureHistory();
    }
  }

  onCanvasWheel(event: WheelEvent): void {
    const canvas = event.currentTarget as HTMLElement | null;
    if (!canvas) {
      return;
    }

    event.preventDefault();
    if (event.ctrlKey) {
      const rect = canvas.getBoundingClientRect();
      const delta = event.deltaY < 0 ? this.zoomStep : -this.zoomStep;
      this.setZoom(this.zoomLevel() + delta, {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
      });
      return;
    }

    this.viewportOffset.update((offset) => ({
      x: this.roundToTwoDecimals(offset.x - event.deltaX),
      y: this.roundToTwoDecimals(offset.y - event.deltaY),
    }));
  }

  zoomIn(): void {
    this.setZoom(this.zoomLevel() + this.zoomStep);
  }

  zoomOut(): void {
    this.setZoom(this.zoomLevel() - this.zoomStep);
  }

  resetZoom(): void {
    this.zoomLevel.set(1);
  }

  zoomPercentage(): number {
    return Math.round(this.zoomLevel() * 100);
  }

  canvasViewportTransform(): string {
    const offset = this.viewportOffset();
    return `translate(${offset.x}px, ${offset.y}px)`;
  }

  canvasSceneZoom(): number {
    return this.zoomLevel();
  }

  canvasBackgroundSize(): string {
    const size = this.roundToTwoDecimals(this.gridSize * this.zoomLevel());
    return `${size}px ${size}px`;
  }

  canvasBackgroundPosition(): string {
    const offset = this.viewportOffset();
    return `${offset.x}px ${offset.y}px`;
  }

  isPanReady(): boolean {
    return this.currentTool() === 'select' || this.isSpacePressed();
  }

  getElementBorderStyle(element: CanvasElement): string {
    return this.getElementStrokeStyle(element, 'inside');
  }

  getElementOutlineStyle(element: CanvasElement): string {
    return this.getElementStrokeStyle(element, 'outside');
  }

  getElementOutlineOffset(_element: CanvasElement): number {
    return 0;
  }

  getRenderedX(element: CanvasElement): number {
    return this.getAbsoluteBounds(element).x;
  }

  getRenderedY(element: CanvasElement): number {
    return this.getAbsoluteBounds(element).y;
  }

  getFrameTitle(element: CanvasElement): string {
    return element.name?.trim() || 'Frame';
  }

  getFrameTitleFontSize(): number {
    return this.getScreenInvariantSize(12.5);
  }

  getFrameTitleOffset(): number {
    return this.getScreenInvariantSize(-24);
  }

  getSelectionOutlineInset(): number {
    return this.getScreenInvariantSize(-2);
  }

  getSelectionOutlineBorderWidth(): number {
    return this.getScreenInvariantSize(2);
  }

  getResizeHandleSize(): number {
    return this.getScreenInvariantSize(12);
  }

  getResizeHandleBorderWidth(): number {
    return this.getScreenInvariantSize(2);
  }

  getResizeHandleOffset(): number {
    return this.getScreenInvariantSize(-8);
  }

  isTextEditing(elementId: string): boolean {
    return this.editingTextElementId() === elementId;
  }

  getElementClipPath(element: CanvasElement): string {
    const parent = this.findElementById(element.parentId ?? null);
    if (!parent) {
      return 'none';
    }

    const bounds = this.getAbsoluteBounds(element);
    const parentBounds = this.getAbsoluteBounds(parent);
    const topInset = Math.max(0, parentBounds.y - bounds.y);
    const rightInset = Math.max(0, bounds.x + bounds.width - (parentBounds.x + parentBounds.width));
    const bottomInset = Math.max(
      0,
      bounds.y + bounds.height - (parentBounds.y + parentBounds.height),
    );
    const leftInset = Math.max(0, parentBounds.x - bounds.x);

    if (topInset === 0 && rightInset === 0 && bottomInset === 0 && leftInset === 0) {
      return 'none';
    }

    return `inset(${topInset}px ${rightInset}px ${bottomInset}px ${leftInset}px)`;
  }

  isElementClippedOut(element: CanvasElement): boolean {
    const parent = this.findElementById(element.parentId ?? null);
    if (!parent) {
      return false;
    }

    const bounds = this.getAbsoluteBounds(element);
    const parentBounds = this.getAbsoluteBounds(parent);
    const intersectionWidth =
      Math.min(bounds.x + bounds.width, parentBounds.x + parentBounds.width) -
      Math.max(bounds.x, parentBounds.x);
    const intersectionHeight =
      Math.min(bounds.y + bounds.height, parentBounds.y + parentBounds.height) -
      Math.max(bounds.y, parentBounds.y);

    return intersectionWidth <= 0 || intersectionHeight <= 0;
  }

  getTextFontFamily(element: CanvasElement): string {
    return element.fontFamily ?? 'Inter';
  }

  getTextFontWeight(element: CanvasElement): number {
    return element.fontWeight ?? 400;
  }

  getTextFontStyle(element: CanvasElement): string {
    return element.fontStyle ?? 'normal';
  }

  getTextLineHeight(element: CanvasElement): number {
    return element.lineHeight ?? 1.2;
  }

  getTextLetterSpacing(element: CanvasElement): string {
    return `${element.letterSpacing ?? 0}px`;
  }

  getTextJustifyContent(element: CanvasElement): string {
    switch (element.textAlign) {
      case 'left':
        return 'flex-start';
      case 'right':
        return 'flex-end';
      default:
        return 'center';
    }
  }

  getTextAlignItems(element: CanvasElement): string {
    switch (element.textVerticalAlign) {
      case 'top':
        return 'flex-start';
      case 'bottom':
        return 'flex-end';
      default:
        return 'center';
    }
  }

  getTextAlignValue(element: CanvasElement): string {
    return element.textAlign ?? 'center';
  }

  trackByElementId(_: number, element: CanvasElement): string {
    return element.id;
  }

  handleClass(handle: CornerHandle): string {
    return `handle-${handle}`;
  }

  cornerZoneClass(corner: CornerHandle): string {
    return `corner-zone-${corner}`;
  }

  getElementTransform(element: CanvasElement): string | null {
    const rotation = element.rotation ?? 0;
    if (rotation === 0) {
      return null;
    }

    return `rotate(${rotation}deg)`;
  }

  getCornerZoneSize(): number {
    return this.getScreenInvariantSize(24);
  }

  getCornerZoneOffset(): number {
    return this.getScreenInvariantSize(-12);
  }

  getEdgeHitThickness(): number {
    return this.getScreenInvariantSize(8);
  }

  getEdgeHitCornerGap(): number {
    return this.getScreenInvariantSize(16);
  }

  validateIR(): void {
    this.apiError.set(null);
    this.validationResult.set(null);
    this.isValidating.set(true);

    this.canvasGenerationService.validate(this.selectedFramework(), this.irPreview()).subscribe({
      next: (response) => {
        this.validationResult.set(response.isValid);
        this.isValidating.set(false);
      },
      error: (error: { error?: { message?: string; title?: string; detail?: string } }) => {
        this.apiError.set(extractApiErrorMessage(error, 'IR validation failed.'));
        this.isValidating.set(false);
      },
    });
  }

  generateCode(): void {
    this.apiError.set(null);
    this.generatedHtml.set('');
    this.generatedCss.set('');
    this.isGenerating.set(true);

    this.canvasGenerationService.generate(this.selectedFramework(), this.irPreview()).subscribe({
      next: (response) => {
        this.generatedHtml.set(response.html);
        this.generatedCss.set(response.css);
        this.validationResult.set(response.isValid);
        this.isGenerating.set(false);
      },
      error: (error: { error?: { message?: string; title?: string; detail?: string } }) => {
        this.apiError.set(extractApiErrorMessage(error, 'Code generation failed.'));
        this.isGenerating.set(false);
      },
    });
  }

  @HostListener('window:keydown', ['$event'])
  handleKeyDown(event: KeyboardEvent): void {
    if (event.defaultPrevented) {
      return;
    }

    const isTypingContext = this.isTypingContext(event);

    if (!isTypingContext && (event.ctrlKey || event.metaKey)) {
      const key = event.key.toLowerCase();
      if (key === 'c') {
        event.preventDefault();
        this.copySelectedElement();
        return;
      }

      if (key === 'v') {
        event.preventDefault();
        this.pasteClipboard();
        return;
      }

      if (key === 'z' && !event.shiftKey) {
        event.preventDefault();
        this.undo();
        return;
      }

      if (key === 'y' || (key === 'z' && event.shiftKey)) {
        event.preventDefault();
        this.redo();
        return;
      }
    }

    if (this.editingTextElementId()) {
      return;
    }

    if (event.code === 'Space' && !isTypingContext) {
      this.isSpacePressed.set(true);
      event.preventDefault();
      return;
    }

    if (isTypingContext) {
      return;
    }

    if (event.key.toLowerCase() === 'v') this.selectTool('select');
    if (event.key.toLowerCase() === 'f') this.selectTool('frame');
    if (event.key.toLowerCase() === 'r') this.selectTool('rectangle');
    if (event.key.toLowerCase() === 'o') this.selectTool('circle');
    if (event.key.toLowerCase() === 't') this.selectTool('text');
    if (event.key.toLowerCase() === 'i') this.selectTool('image');

    if (event.key === 'Delete' || event.key === 'Backspace') {
      const selectedId = this.selectedElementId();
      if (!selectedId) {
        return;
      }

      this.runWithHistory(() => {
        this.updateCurrentPageElements((elements) => this.removeWithChildren(elements, selectedId));
        this.selectedElementId.set(null);
      });
    }
  }

  @HostListener('window:keyup', ['$event'])
  handleKeyUp(event: KeyboardEvent): void {
    if (event.code === 'Space') {
      this.isSpacePressed.set(false);
    }
  }

  @HostListener('window:blur')
  handleWindowBlur(): void {
    this.isSpacePressed.set(false);
    this.isPanning.set(false);
    this.isDragging = false;
    this.isResizing = false;
    this.isRotating = false;
    this.commitGestureHistory();
    this.commitTextEditHistory();
    this.editingTextElementId.set(null);
  }

  private loadProjectDesign(): void {
    if (!Number.isInteger(this.projectIdAsNumber)) {
      this.apiError.set('Invalid project id.');
      return;
    }

    this.isLoadingDesign.set(true);
    this.apiError.set(null);
    this.canPersistDesign = false;

    this.canvasPersistenceService.loadProjectDesign(this.projectIdAsNumber).subscribe({
      next: (response) => {
        const pages = response.pages.length > 0 ? response.pages : [this.createPage('Page 1')];
        const activePageId =
          response.activePageId && pages.some((page) => page.id === response.activePageId)
            ? response.activePageId
            : (pages[0]?.id ?? null);

        this.pages.set(pages);
        this.currentPageId.set(activePageId);
        this.selectedElementId.set(null);
        this.lastSavedAt.set(response.updatedAt ?? null);
        this.resetHistory();
        this.isLoadingDesign.set(false);
        this.canPersistDesign = true;
      },
      error: (error: { error?: { message?: string; title?: string; detail?: string } }) => {
        this.apiError.set(extractApiErrorMessage(error, 'Failed to load project design.'));
        this.isLoadingDesign.set(false);
        this.canPersistDesign = true;
      },
    });
  }

  private scheduleDesignSave(): void {
    if (!Number.isInteger(this.projectIdAsNumber)) {
      return;
    }

    if (this.saveTimeoutId) {
      clearTimeout(this.saveTimeoutId);
    }

    this.saveTimeoutId = setTimeout(() => {
      this.persistDesign();
    }, 500);
  }

  private persistDesign(): void {
    if (!Number.isInteger(this.projectIdAsNumber)) {
      return;
    }

    const document = this.buildProjectDocument();
    this.isSavingDesign.set(true);

    this.canvasPersistenceService.saveProjectDesign(this.projectIdAsNumber, document).subscribe({
      next: (response) => {
        this.lastSavedAt.set(response.updatedAt ?? null);
        this.isSavingDesign.set(false);
      },
      error: (error: { error?: { message?: string; title?: string; detail?: string } }) => {
        this.apiError.set(extractApiErrorMessage(error, 'Failed to save project design.'));
        this.isSavingDesign.set(false);
      },
    });
  }

  private buildProjectDocument(): CanvasProjectDocument {
    return buildCanvasProjectDocument(this.pages(), this.projectId, this.currentPageId());
  }

  private createElementAtPoint(tool: CanvasElementType, pointer: Point): CanvasElement | null {
    const selectedFrame = this.getSelectedFrame();
    if (tool !== 'frame' && !selectedFrame) {
      this.apiError.set(
        'Select a frame first. Shapes, text, and images must be placed inside a frame.',
      );
      return null;
    }

    const defaultWidth =
      tool === 'frame'
        ? this.frameTemplate().width
        : tool === 'text'
          ? 150
          : tool === 'image'
            ? 180
            : 100;
    const defaultHeight =
      tool === 'frame'
        ? this.frameTemplate().height
        : tool === 'text'
          ? 40
          : tool === 'image'
            ? 120
            : 100;

    let x = this.roundToTwoDecimals(pointer.x - defaultWidth / 2);
    let y = this.roundToTwoDecimals(pointer.y - defaultHeight / 2);
    let parentId: string | null = null;

    if (tool === 'frame') {
      const nextFramePosition = this.getNextFramePosition(defaultWidth, defaultHeight);
      if (nextFramePosition) {
        x = nextFramePosition.x;
        y = nextFramePosition.y;
      }
    }

    if (tool !== 'frame' && selectedFrame) {
      const frameBounds = this.getAbsoluteBounds(selectedFrame);
      if (!this.isPointInsideRenderedElement(pointer.x, pointer.y, selectedFrame)) {
        this.apiError.set('Click inside the selected frame to place the element.');
        return null;
      }

      x = this.clamp(
        pointer.x - frameBounds.x - defaultWidth / 2,
        0,
        selectedFrame.width - defaultWidth,
      );
      y = this.clamp(
        pointer.y - frameBounds.y - defaultHeight / 2,
        0,
        selectedFrame.height - defaultHeight,
      );
      parentId = selectedFrame.id;
    }

    return {
      id: crypto.randomUUID(),
      type: tool,
      name: this.getNextElementName(tool),
      x,
      y,
      width: defaultWidth,
      height: defaultHeight,
      visible: true,
      fill: tool === 'frame' ? this.defaultFrameFill : this.defaultElementFill,
      strokeWidth: tool === 'text' ? undefined : 1,
      strokePosition: tool === 'text' ? undefined : 'inside',
      opacity: 1,
      cornerRadius: tool === 'image' ? 6 : 0,
      text: tool === 'text' ? 'New text' : undefined,
      fontSize: tool === 'text' ? 16 : undefined,
      fontFamily: tool === 'text' ? 'Inter' : undefined,
      fontWeight: tool === 'text' ? 400 : undefined,
      fontStyle: tool === 'text' ? 'normal' : undefined,
      textAlign: tool === 'text' ? 'center' : undefined,
      textVerticalAlign: tool === 'text' ? 'middle' : undefined,
      letterSpacing: tool === 'text' ? 0 : undefined,
      lineHeight: tool === 'text' ? 1.2 : undefined,
      imageUrl: tool === 'image' ? this.imagePlaceholderUrl : undefined,
      parentId,
    };
  }

  private createFrameAtCenter(
    center: Point,
    width: number,
    height: number,
    name: string,
  ): CanvasElement {
    const nextFramePosition = this.getNextFramePosition(width, height);

    return {
      id: crypto.randomUUID(),
      type: 'frame',
      name: this.getNextFrameName(name),
      x: nextFramePosition?.x ?? this.roundToTwoDecimals(center.x - width / 2),
      y: nextFramePosition?.y ?? this.roundToTwoDecimals(center.y - height / 2),
      width,
      height,
      visible: true,
      fill: this.defaultFrameFill,
      strokeWidth: 1,
      strokePosition: 'inside',
      opacity: 1,
      cornerRadius: 0,
      parentId: null,
    };
  }

  private copySelectedElement(): void {
    const selectedId = this.selectedElementId();
    if (!selectedId) {
      return;
    }

    const subtreeIds = new Set(this.collectSubtreeIds(this.elements(), selectedId));
    const copiedElements = this.elements()
      .filter((element) => subtreeIds.has(element.id))
      .map((element) => structuredClone(element));

    if (copiedElements.length === 0) {
      return;
    }

    this.clipboardSnapshot = {
      rootId: selectedId,
      sourcePageId: this.currentPageId(),
      pasteCount: 0,
      elements: copiedElements,
    };
    this.apiError.set(null);
  }

  private pasteClipboard(): void {
    const clipboard = this.clipboardSnapshot;
    if (!clipboard) {
      return;
    }

    const currentPage = this.currentPage();
    if (!currentPage) {
      return;
    }

    const rootElement = clipboard.elements.find((element) => element.id === clipboard.rootId);
    if (!rootElement) {
      return;
    }

    const targetParentId = this.resolvePasteParentId(rootElement, currentPage.elements);
    if (rootElement.type !== 'frame' && !targetParentId) {
      this.apiError.set('Select a destination frame before pasting this element.');
      return;
    }

    const pastedElements = this.createPastedElements(
      clipboard,
      currentPage.elements,
      targetParentId,
    );
    if (pastedElements.length === 0) {
      return;
    }

    this.runWithHistory(() => {
      this.updateCurrentPageElements((elements) => [...elements, ...pastedElements]);
      this.selectedElementId.set(pastedElements[0]?.id ?? null);
      this.editingTextElementId.set(null);
      this.currentTool.set('select');
    });

    this.apiError.set(null);
    this.clipboardSnapshot = {
      ...clipboard,
      pasteCount: clipboard.pasteCount + 1,
    };
  }

  private handleRotatePointerMove(event: MouseEvent): void {
    const start = this.rotateStart;
    if (!start.elementId) {
      return;
    }

    const pointer = this.getCanvasPoint(event);
    if (!pointer) {
      return;
    }

    const currentAngle =
      Math.atan2(pointer.y - start.centerY, pointer.x - start.centerX) * (180 / Math.PI);
    let angleDelta = currentAngle - start.startAngle;
    let newRotation = start.initialRotation + angleDelta;

    if (event.shiftKey) {
      newRotation = Math.round(newRotation / 15) * 15;
    }

    newRotation = ((newRotation % 360) + 360) % 360;
    newRotation = this.roundToTwoDecimals(newRotation);

    this.updateCurrentPageElements((elements) =>
      elements.map((element) => {
        if (element.id !== start.elementId) {
          return element;
        }

        return { ...element, rotation: newRotation };
      }),
    );
  }

  private handleResizePointerMove(event: MouseEvent): void {
    const start = this.resizeStart;
    if (!start.elementId) {
      return;
    }

    const pointer = this.getCanvasPoint(event);
    if (!pointer) {
      return;
    }

    this.updateCurrentPageElements((elements) =>
      elements.map((element) => {
        if (element.id !== start.elementId) {
          return element;
        }

        const parent = this.findElementById(element.parentId ?? null, elements);
        const parentBounds = parent ? this.getAbsoluteBounds(parent, elements) : null;
        const bounds = this.calculateResizedBounds(
          element,
          parentBounds,
          pointer,
          event.shiftKey,
          event.altKey,
        );

        const nextElement: CanvasElement = {
          ...element,
          x: parentBounds ? bounds.x - parentBounds.x : bounds.x,
          y: parentBounds ? bounds.y - parentBounds.y : bounds.y,
          width: bounds.width,
          height: bounds.height,
        };

        this.normalizeElement(nextElement, elements);
        return nextElement;
      }),
    );
  }

  private calculateResizedBounds(
    element: CanvasElement,
    parentBounds: Bounds | null,
    pointer: Point,
    preserveAspectRatio: boolean,
    scaleFromCenter: boolean,
  ): Bounds {
    const start = this.resizeStart;
    const deltaX = pointer.x - start.pointerX;
    const deltaY = pointer.y - start.pointerY;
    const xDirection = start.handle.includes('w') ? -1 : 1;
    const yDirection = start.handle.includes('n') ? -1 : 1;
    const isEdgeHandle =
      start.handle === 'n' || start.handle === 's' || start.handle === 'e' || start.handle === 'w';
    const isNS = start.handle === 'n' || start.handle === 's';
    const isEW = start.handle === 'e' || start.handle === 'w';
    const effectiveDeltaX = isNS ? 0 : deltaX;
    const effectiveDeltaY = isEW ? 0 : deltaY;
    const shouldPreserveAspectRatio =
      !isEdgeHandle && (preserveAspectRatio || element.type === 'circle');
    const aspectRatio = shouldPreserveAspectRatio
      ? start.aspectRatio || 1
      : start.width / Math.max(start.height, 1);

    let left = start.absoluteX;
    let top = start.absoluteY;
    let right = start.absoluteX + start.width;
    let bottom = start.absoluteY + start.height;

    const minLeft = parentBounds ? parentBounds.x : Number.NEGATIVE_INFINITY;
    const minTop = parentBounds ? parentBounds.y : Number.NEGATIVE_INFINITY;
    const maxRight = parentBounds ? parentBounds.x + parentBounds.width : Number.POSITIVE_INFINITY;
    const maxBottom = parentBounds
      ? parentBounds.y + parentBounds.height
      : Number.POSITIVE_INFINITY;

    if (scaleFromCenter) {
      const candidateHalfWidth = start.width / 2 + xDirection * effectiveDeltaX;
      const candidateHalfHeight = start.height / 2 + yDirection * effectiveDeltaY;
      const maxHalfWidth = Math.max(
        this.minElementSize / 2,
        Math.min(start.centerX - minLeft, maxRight - start.centerX),
      );
      const maxHalfHeight = Math.max(
        this.minElementSize / 2,
        Math.min(start.centerY - minTop, maxBottom - start.centerY),
      );

      if (shouldPreserveAspectRatio) {
        const scaleX = candidateHalfWidth / Math.max(start.width / 2, 1);
        const scaleY = candidateHalfHeight / Math.max(start.height / 2, 1);
        const dominantScale = Math.abs(scaleX - 1) >= Math.abs(scaleY - 1) ? scaleX : scaleY;
        const minScale = Math.max(
          this.minElementSize / Math.max(start.width, 1),
          this.minElementSize / Math.max(start.height, 1),
        );
        const maxScale = Math.min(
          (maxHalfWidth * 2) / Math.max(start.width, 1),
          (maxHalfHeight * 2) / Math.max(start.height, 1),
        );
        const scale = this.clamp(dominantScale, minScale, Math.max(minScale, maxScale));
        const width = this.roundToTwoDecimals(start.width * scale);
        const height = this.roundToTwoDecimals(width / aspectRatio);

        return {
          x: this.roundToTwoDecimals(start.centerX - width / 2),
          y: this.roundToTwoDecimals(start.centerY - height / 2),
          width,
          height,
        };
      }

      const halfWidth = this.clamp(candidateHalfWidth, this.minElementSize / 2, maxHalfWidth);
      const halfHeight = this.clamp(candidateHalfHeight, this.minElementSize / 2, maxHalfHeight);

      return {
        x: this.roundToTwoDecimals(start.centerX - halfWidth),
        y: this.roundToTwoDecimals(start.centerY - halfHeight),
        width: this.roundToTwoDecimals(halfWidth * 2),
        height: this.roundToTwoDecimals(halfHeight * 2),
      };
    }

    if (shouldPreserveAspectRatio) {
      const candidateWidth = start.handle.includes('w')
        ? start.width - deltaX
        : start.width + deltaX;
      const candidateHeight = start.handle.includes('n')
        ? start.height - deltaY
        : start.height + deltaY;
      const scaleX = candidateWidth / Math.max(start.width, 1);
      const scaleY = candidateHeight / Math.max(start.height, 1);
      const dominantScale = Math.abs(scaleX - 1) >= Math.abs(scaleY - 1) ? scaleX : scaleY;
      const minScale = Math.max(
        this.minElementSize / Math.max(start.width, 1),
        this.minElementSize / Math.max(start.height, 1),
      );
      const maxScale = Math.min(
        (start.handle.includes('w') ? right - minLeft : maxRight - left) / Math.max(start.width, 1),
        (start.handle.includes('n') ? bottom - minTop : maxBottom - top) /
          Math.max(start.height, 1),
      );
      const scale = this.clamp(dominantScale, minScale, Math.max(minScale, maxScale));
      const width = this.roundToTwoDecimals(start.width * scale);
      const height = this.roundToTwoDecimals(width / aspectRatio);

      if (start.handle.includes('w')) {
        left = right - width;
      } else {
        right = left + width;
      }

      if (start.handle.includes('n')) {
        top = bottom - height;
      } else {
        bottom = top + height;
      }

      return {
        x: this.roundToTwoDecimals(left),
        y: this.roundToTwoDecimals(top),
        width: this.roundToTwoDecimals(right - left),
        height: this.roundToTwoDecimals(bottom - top),
      };
    }

    if (start.handle.includes('w')) {
      left = this.clamp(start.absoluteX + deltaX, minLeft, right - this.minElementSize);
    }

    if (start.handle.includes('e')) {
      right = this.clamp(
        start.absoluteX + start.width + deltaX,
        left + this.minElementSize,
        maxRight,
      );
    }

    if (start.handle.includes('n')) {
      top = this.clamp(start.absoluteY + deltaY, minTop, bottom - this.minElementSize);
    }

    if (start.handle.includes('s')) {
      bottom = this.clamp(
        start.absoluteY + start.height + deltaY,
        top + this.minElementSize,
        maxBottom,
      );
    }

    let width = this.roundToTwoDecimals(right - left);
    let height = this.roundToTwoDecimals(bottom - top);

    return {
      x: this.roundToTwoDecimals(left),
      y: this.roundToTwoDecimals(top),
      width: this.roundToTwoDecimals(right - left),
      height: this.roundToTwoDecimals(bottom - top),
    };
  }

  private focusElement(element: CanvasElement): void {
    const canvas = this.getCanvasElement();
    if (!canvas) {
      return;
    }

    const padding = 64;
    const bounds = this.getAbsoluteBounds(element);
    const horizontalZoom =
      (canvas.clientWidth - padding) / Math.max(bounds.width, this.minElementSize);
    const verticalZoom =
      (canvas.clientHeight - padding) / Math.max(bounds.height, this.minElementSize);
    const zoom = this.clamp(Math.min(horizontalZoom, verticalZoom), this.minZoom, this.maxZoom);

    this.zoomLevel.set(zoom);
    this.viewportOffset.set({
      x: this.roundToTwoDecimals((canvas.clientWidth - bounds.width * zoom) / 2 - bounds.x * zoom),
      y: this.roundToTwoDecimals(
        (canvas.clientHeight - bounds.height * zoom) / 2 - bounds.y * zoom,
      ),
    });
  }

  private getViewportCenterCanvasPoint(): Point {
    const canvas = this.getCanvasElement();
    if (!canvas) {
      return { x: 320, y: 240 };
    }

    const offset = this.viewportOffset();
    return {
      x: this.roundToTwoDecimals((canvas.clientWidth / 2 - offset.x) / this.zoomLevel()),
      y: this.roundToTwoDecimals((canvas.clientHeight / 2 - offset.y) / this.zoomLevel()),
    };
  }

  private setZoom(nextZoom: number, anchor?: Point): void {
    const previousZoom = this.zoomLevel();
    const clampedZoom = this.clamp(nextZoom, this.minZoom, this.maxZoom);

    if (clampedZoom === previousZoom) {
      return;
    }

    if (anchor) {
      const offset = this.viewportOffset();
      const worldX = (anchor.x - offset.x) / previousZoom;
      const worldY = (anchor.y - offset.y) / previousZoom;

      this.viewportOffset.set({
        x: this.roundToTwoDecimals(anchor.x - worldX * clampedZoom),
        y: this.roundToTwoDecimals(anchor.y - worldY * clampedZoom),
      });
    }

    this.zoomLevel.set(clampedZoom);
  }

  private getScreenInvariantSize(size: number): number {
    return this.roundToTwoDecimals(size / this.zoomLevel());
  }

  private getCanvasPoint(event: MouseEvent): Point | null {
    const canvas = this.getCanvasElement();
    if (!canvas) {
      return null;
    }

    const rect = canvas.getBoundingClientRect();
    const offset = this.viewportOffset();

    return {
      x: this.roundToTwoDecimals((event.clientX - rect.left - offset.x) / this.zoomLevel()),
      y: this.roundToTwoDecimals((event.clientY - rect.top - offset.y) / this.zoomLevel()),
    };
  }

  private shouldStartPanning(event: MouseEvent, target: HTMLElement): boolean {
    if (event.button === 1) {
      return true;
    }

    if (event.button !== 0) {
      return false;
    }

    if (this.isSpacePressed()) {
      return true;
    }

    return this.currentTool() === 'select' && this.isCanvasBackgroundTarget(target);
  }

  private startPanning(event: MouseEvent): void {
    this.isPanning.set(true);
    this.isDragging = false;
    this.isResizing = false;
    this.panMoved = false;
    this.panStart = { x: event.clientX, y: event.clientY };
    event.preventDefault();
    event.stopPropagation();
  }

  private isCanvasBackgroundTarget(target: HTMLElement): boolean {
    return (
      target.classList.contains('canvas-container') || target.classList.contains('canvas-viewport')
    );
  }

  private getCanvasElement(): HTMLElement | null {
    return document.querySelector('.canvas-container') as HTMLElement | null;
  }

  private focusInlineTextEditor(elementId: string): void {
    setTimeout(() => {
      const editor = document.querySelector(
        `[data-text-editor-id="${elementId}"]`,
      ) as HTMLTextAreaElement | null;

      if (!editor) {
        return;
      }

      editor.focus();
      const textLength = editor.value.length;
      editor.setSelectionRange(textLength, textLength);
    }, 0);
  }

  private getSelectedFrame(): CanvasElement | null {
    const selected = this.selectedElement();
    return selected?.type === 'frame' ? selected : null;
  }

  private isPointInsideRenderedElement(x: number, y: number, element: CanvasElement): boolean {
    const bounds = this.getAbsoluteBounds(element);
    return (
      x >= bounds.x &&
      x <= bounds.x + bounds.width &&
      y >= bounds.y &&
      y <= bounds.y + bounds.height
    );
  }

  private getAbsoluteBounds(element: CanvasElement, elements = this.elements()): Bounds {
    const parent = this.findElementById(element.parentId ?? null, elements);
    if (!parent || element.type === 'frame') {
      return {
        x: this.roundToTwoDecimals(element.x),
        y: this.roundToTwoDecimals(element.y),
        width: this.roundToTwoDecimals(element.width),
        height: this.roundToTwoDecimals(element.height),
      };
    }

    const parentBounds = this.getAbsoluteBounds(parent, elements);
    return {
      x: this.roundToTwoDecimals(parentBounds.x + element.x),
      y: this.roundToTwoDecimals(parentBounds.y + element.y),
      width: this.roundToTwoDecimals(element.width),
      height: this.roundToTwoDecimals(element.height),
    };
  }

  private findElementById(id: string | null, elements = this.elements()): CanvasElement | null {
    if (!id) {
      return null;
    }

    return elements.find((element) => element.id === id) ?? null;
  }

  private isElementEffectivelyVisible(elementId: string): boolean {
    const elements = this.elements();
    let current = this.findElementById(elementId, elements);

    while (current) {
      if (current.visible === false) {
        return false;
      }

      current = this.findElementById(current.parentId ?? null, elements);
    }

    return true;
  }

  private reorderLayerElements(
    elements: CanvasElement[],
    draggedId: string,
    targetId: string,
    position: 'before' | 'after' | 'inside',
  ): CanvasElement[] {
    if (draggedId === targetId) {
      return elements;
    }

    const dragged = elements.find((element) => element.id === draggedId);
    const target = elements.find((element) => element.id === targetId);
    if (!dragged || !target) {
      return elements;
    }

    if (position === 'inside' && (target.type !== 'frame' || dragged.type === 'frame')) {
      return elements;
    }

    const draggedSubtreeIds = new Set(this.collectSubtreeIds(elements, draggedId));
    const targetSubtreeIds = this.collectSubtreeIds(elements, targetId);
    if (targetSubtreeIds.includes(draggedId)) {
      return elements;
    }

    const draggedSubtree = elements.filter((element) => draggedSubtreeIds.has(element.id));
    const remaining = elements.filter((element) => !draggedSubtreeIds.has(element.id));
    const draggedRoot = draggedSubtree[0];
    if (!draggedRoot) {
      return elements;
    }

    const draggedBounds = this.getAbsoluteBounds(dragged, elements);
    const targetIndex = remaining.findIndex((element) => element.id === targetId);
    if (targetIndex === -1) {
      return elements;
    }

    let nextParentId = dragged.parentId ?? null;
    let insertIndex = targetIndex;

    if (position === 'inside') {
      nextParentId = target.id;
      insertIndex = targetIndex + targetSubtreeIds.length;
    } else {
      nextParentId = target.parentId ?? null;
      insertIndex = position === 'after' ? targetIndex + targetSubtreeIds.length : targetIndex;
    }

    const nextParent = nextParentId
      ? (remaining.find((element) => element.id === nextParentId) ?? null)
      : null;

    draggedRoot.parentId = nextParentId;
    if (nextParent) {
      const parentBounds = this.getAbsoluteBounds(nextParent, remaining);
      draggedRoot.x = this.clamp(
        draggedBounds.x - parentBounds.x,
        0,
        nextParent.width - draggedRoot.width,
      );
      draggedRoot.y = this.clamp(
        draggedBounds.y - parentBounds.y,
        0,
        nextParent.height - draggedRoot.height,
      );
    } else {
      draggedRoot.x = this.roundToTwoDecimals(draggedBounds.x);
      draggedRoot.y = this.roundToTwoDecimals(draggedBounds.y);
    }

    return [...remaining.slice(0, insertIndex), ...draggedSubtree, ...remaining.slice(insertIndex)];
  }

  private collectSubtreeIds(elements: CanvasElement[], rootId: string): string[] {
    const collected: string[] = [];
    const visit = (currentId: string) => {
      collected.push(currentId);
      const children = elements.filter((element) => (element.parentId ?? null) === currentId);
      for (const child of children) {
        visit(child.id);
      }
    };

    visit(rootId);
    return collected;
  }

  private getNextFramePosition(width: number, height: number): Point | null {
    const rootFrames = this.elements().filter(
      (element) => element.type === 'frame' && !element.parentId,
    );

    if (rootFrames.length === 0) {
      return null;
    }

    const rightMostFrame = rootFrames.reduce((currentRightMost, candidate) => {
      const currentBounds = this.getAbsoluteBounds(currentRightMost);
      const candidateBounds = this.getAbsoluteBounds(candidate);
      const currentRight = currentBounds.x + currentBounds.width;
      const candidateRight = candidateBounds.x + candidateBounds.width;

      return candidateRight > currentRight ? candidate : currentRightMost;
    }, rootFrames[0]);

    const bounds = this.getAbsoluteBounds(rightMostFrame);
    return {
      x: this.roundToTwoDecimals(bounds.x + bounds.width + this.frameInsertGap),
      y: this.roundToTwoDecimals(bounds.y),
    };
  }

  private updateCurrentPageElements(updater: (elements: CanvasElement[]) => CanvasElement[]): void {
    const currentPageId = this.currentPageId();
    if (!currentPageId) {
      return;
    }

    this.pages.update((pages) =>
      pages.map((page) =>
        page.id === currentPageId
          ? {
              ...page,
              elements: updater(page.elements),
            }
          : page,
      ),
    );
  }

  private resolvePasteParentId(
    rootElement: CanvasElement,
    currentElements: CanvasElement[],
  ): string | null {
    if (rootElement.type === 'frame') {
      return null;
    }

    const originalParentId = rootElement.parentId ?? null;
    if (
      originalParentId &&
      currentElements.some((element) => element.id === originalParentId && element.type === 'frame')
    ) {
      return originalParentId;
    }

    const selectedFrame = this.getSelectedFrame();
    return selectedFrame?.id ?? null;
  }

  private createPastedElements(
    clipboard: CanvasClipboardSnapshot,
    currentElements: CanvasElement[],
    targetParentId: string | null,
  ): CanvasElement[] {
    const rootElement = clipboard.elements.find((element) => element.id === clipboard.rootId);
    if (!rootElement) {
      return [];
    }

    const idMap = new Map(clipboard.elements.map((element) => [element.id, crypto.randomUUID()]));
    const targetParent = targetParentId
      ? (currentElements.find((element) => element.id === targetParentId) ?? null)
      : null;
    const offset = this.clipboardPasteOffset * (clipboard.pasteCount + 1);
    const pastedElements = clipboard.elements.map((element) => {
      const clonedElement = structuredClone(element);
      clonedElement.id = idMap.get(element.id) ?? crypto.randomUUID();

      if (element.id === clipboard.rootId) {
        clonedElement.parentId = targetParentId;

        if (targetParent) {
          clonedElement.x = this.clamp(element.x + offset, 0, targetParent.width - element.width);
          clonedElement.y = this.clamp(element.y + offset, 0, targetParent.height - element.height);
        } else {
          clonedElement.x = this.roundToTwoDecimals(element.x + offset);
          clonedElement.y = this.roundToTwoDecimals(element.y + offset);
        }

        return clonedElement;
      }

      clonedElement.parentId = element.parentId ? (idMap.get(element.parentId) ?? null) : null;
      return clonedElement;
    });

    return pastedElements;
  }

  private getElementStrokeStyle(
    element: CanvasElement,
    targetPosition: CanvasStrokePosition,
  ): string {
    if (!element.stroke || element.type === 'text') {
      return 'none';
    }

    const strokeWidth = this.getStrokeWidth(element);
    if (strokeWidth <= 0) {
      return 'none';
    }

    const strokePosition = this.getStrokePosition(element);
    if (strokePosition !== targetPosition) {
      return 'none';
    }

    return `${strokeWidth}px solid ${element.stroke}`;
  }

  private createPage(name: string): CanvasPageModel {
    return {
      id: crypto.randomUUID(),
      name,
      elements: [],
    };
  }

  private getNextPageName(): string {
    return `Page ${this.pages().length + 1}`;
  }

  private getNextElementName(type: CanvasElementType): string {
    const index = this.elements().filter((element) => element.type === type).length + 1;
    return `${formatCanvasElementTypeLabel(type)} ${index}`;
  }

  private getNextFrameName(templateName: string): string {
    const frameIndex = this.elements().filter((element) => element.type === 'frame').length + 1;
    return `${templateName} ${frameIndex}`;
  }

  private isTypingTarget(target: EventTarget | null): boolean {
    const element = target as HTMLElement | null;
    if (!element) {
      return false;
    }

    if (element.isContentEditable) {
      return true;
    }

    const tagName = element.tagName;
    return tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT';
  }

  private runWithHistory(action: () => void): void {
    if (this.isApplyingHistory) {
      action();
      return;
    }

    const snapshot = this.createHistorySnapshot();
    action();
    this.pushUndoSnapshotIfChanged(snapshot);
  }

  private beginGestureHistory(): void {
    if (this.isApplyingHistory || this.pendingGestureHistorySnapshot) {
      return;
    }

    this.pendingGestureHistorySnapshot = this.createHistorySnapshot();
  }

  private commitGestureHistory(): void {
    if (!this.pendingGestureHistorySnapshot) {
      return;
    }

    const snapshot = this.pendingGestureHistorySnapshot;
    this.pendingGestureHistorySnapshot = null;
    this.pushUndoSnapshotIfChanged(snapshot);
  }

  private beginTextEditHistory(): void {
    if (this.isApplyingHistory || this.pendingTextEditHistorySnapshot) {
      return;
    }

    this.pendingTextEditHistorySnapshot = this.createHistorySnapshot();
  }

  private commitTextEditHistory(): void {
    if (!this.pendingTextEditHistorySnapshot) {
      return;
    }

    const snapshot = this.pendingTextEditHistorySnapshot;
    this.pendingTextEditHistorySnapshot = null;
    this.pushUndoSnapshotIfChanged(snapshot);
  }

  private undo(): void {
    this.commitGestureHistory();
    this.commitTextEditHistory();

    const snapshot = this.undoStack.pop();
    if (!snapshot) {
      return;
    }

    this.redoStack.push(this.createHistorySnapshot());
    this.applyHistorySnapshot(snapshot);
  }

  private redo(): void {
    this.commitGestureHistory();
    this.commitTextEditHistory();

    const snapshot = this.redoStack.pop();
    if (!snapshot) {
      return;
    }

    this.undoStack.push(this.createHistorySnapshot());
    if (this.undoStack.length > this.maxHistorySteps) {
      this.undoStack = this.undoStack.slice(-this.maxHistorySteps);
    }

    this.applyHistorySnapshot(snapshot);
  }

  private createHistorySnapshot(): HistorySnapshot {
    return {
      pages: structuredClone(this.pages()),
      currentPageId: this.currentPageId(),
      selectedElementId: this.selectedElementId(),
    };
  }

  private applyHistorySnapshot(snapshot: HistorySnapshot): void {
    this.isApplyingHistory = true;
    this.pages.set(structuredClone(snapshot.pages));
    this.currentPageId.set(snapshot.currentPageId);
    this.selectedElementId.set(snapshot.selectedElementId);
    this.currentTool.set('select');
    this.editingTextElementId.set(null);
    this.isApplyingHistory = false;
  }

  private pushUndoSnapshotIfChanged(snapshot: HistorySnapshot): void {
    if (
      this.isApplyingHistory ||
      this.areHistorySnapshotsEqual(snapshot, this.createHistorySnapshot())
    ) {
      return;
    }

    this.undoStack.push(snapshot);
    if (this.undoStack.length > this.maxHistorySteps) {
      this.undoStack = this.undoStack.slice(-this.maxHistorySteps);
    }

    this.redoStack = [];
  }

  private areHistorySnapshotsEqual(left: HistorySnapshot, right: HistorySnapshot): boolean {
    return JSON.stringify(left) === JSON.stringify(right);
  }

  private resetHistory(): void {
    this.undoStack = [];
    this.redoStack = [];
    this.pendingGestureHistorySnapshot = null;
    this.pendingTextEditHistorySnapshot = null;
  }

  private isTypingContext(event: KeyboardEvent): boolean {
    if (this.isTypingTarget(event.target)) {
      return true;
    }

    return this.isTypingTarget(document.activeElement);
  }

  private clamp(value: number, min: number, max: number): number {
    if (max < min) {
      return this.roundToTwoDecimals(min);
    }

    return clamp(value, min, max);
  }

  private roundToTwoDecimals(value: number): number {
    return roundToTwoDecimals(value);
  }

  private normalizeElement(element: CanvasElement, elements: CanvasElement[]): void {
    normalizeElementInPlace(element, elements);
  }

  private getStrokeWidth(element: CanvasElement): number {
    return getStrokeWidth(element);
  }

  private getStrokePosition(element: CanvasElement): CanvasStrokePosition {
    return getStrokePosition(element);
  }

  private removeWithChildren(elements: CanvasElement[], rootId: string): CanvasElement[] {
    return removeWithChildren(elements, rootId);
  }
}
