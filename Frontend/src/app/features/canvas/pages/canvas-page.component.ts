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
} from '../../../core/models/canvas.models';
import { buildCanvasIR, buildCanvasProjectDocument } from '../mappers/canvas-ir.mapper';
import { HeaderBarComponent } from '../../../shared/components/header-bar/header-bar.component';
import { ToolbarComponent } from '../components/toolbar/toolbar.component';
import { ProjectPanelComponent } from '../components/project-panel/project-panel.component';
import { PropertiesPanelComponent } from '../components/properties-panel/properties-panel.component';
import { IRNode } from '../../../core/models/ir.models';
import { extractApiErrorMessage } from '../../../core/utils/api-error.util';
import { clamp, roundToTwoDecimals, getStrokeWidth } from '../utils/canvas-interaction.util';
import { buildSnapCandidates, computeSnappedPosition } from '../utils/canvas-snap.util';
import { CanvasGenerationService } from '../services/canvas-generation.service';
import { CanvasPersistenceService } from '../services/canvas-persistence.service';
import {
  ContextMenuComponent,
} from '../../../shared/components/context-menu/context-menu.component';
import {
  SupportedFramework,
  HandlePosition,
  CornerHandle,
  FrameTemplateSelection,
  Point,
  Bounds,
  ResizeState,
  RotateState,
  CornerRadiusState,
  HistorySnapshot,
  SnapLine,
} from '../canvas.types';
import { CanvasViewportService } from '../services/canvas-viewport.service';
import { CanvasHistoryService } from '../services/canvas-history.service';
import { CanvasClipboardService } from '../services/canvas-clipboard.service';
import { CanvasElementService } from '../services/canvas-element.service';
import { CanvasKeyboardService, KeyboardActionCallbacks } from '../services/canvas-keyboard.service';
import {
  CanvasContextMenuService,
  ContextMenuActionCallbacks,
} from '../services/canvas-context-menu.service';

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
  providers: [
    CanvasViewportService,
    CanvasHistoryService,
    CanvasClipboardService,
    CanvasElementService,
    CanvasKeyboardService,
    CanvasContextMenuService,
  ],
  templateUrl: './canvas-page.component.html',
  styleUrl: './canvas-page.component.css',
})
export class ProjectPage implements OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly canvasGenerationService = inject(CanvasGenerationService);
  private readonly canvasPersistenceService = inject(CanvasPersistenceService);

  readonly viewport = inject(CanvasViewportService);
  private readonly history = inject(CanvasHistoryService);
  private readonly clipboard = inject(CanvasClipboardService);
  readonly el = inject(CanvasElementService);
  private readonly keyboard = inject(CanvasKeyboardService);
  readonly contextMenu = inject(CanvasContextMenuService);

  // ── Core State ────────────────────────────────────────────

  readonly pages = signal<CanvasPageModel[]>([this.el.createPage('Page 1')]);
  readonly currentPageId = signal<string | null>(this.pages()[0]?.id ?? null);
  readonly selectedElementId = signal<string | null>(null);
  readonly editingTextElementId = signal<string | null>(null);
  readonly currentTool = signal<CanvasElementType | 'select'>('select');

  // ── Computed Signals ──────────────────────────────────────

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
    this.elements().filter((element) =>
      this.el.isElementEffectivelyVisible(element.id, this.elements()),
    ),
  );

  readonly currentPageName = computed(() => this.currentPage()?.name ?? 'Untitled page');
  readonly cornerHandles: CornerHandle[] = ['nw', 'ne', 'sw', 'se'];

  // ── API / Generation State ────────────────────────────────

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

  readonly irPreview = computed<IRNode>(() => {
    const currentPage = this.currentPage();
    return buildCanvasIR(this.visibleElements(), this.projectId, currentPage?.name);
  });

  readonly projectId = this.route.snapshot.paramMap.get('id') ?? 'new-project';

  // ── Gesture State (local, not service-worthy) ─────────────

  private readonly projectIdAsNumber = Number.parseInt(this.projectId, 10);
  private canPersistDesign = false;
  private saveTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private dragOffset: Point = { x: 0, y: 0 };
  private dragStartAbsolute: Point = { x: 0, y: 0 };
  private _isDragging = false;
  private get isDragging(): boolean { return this._isDragging; }
  private set isDragging(value: boolean) { this._isDragging = value; this.isDraggingEl.set(value); }
  readonly isDraggingEl = signal(false);
  readonly hoveredElementId = signal<string | null>(null);
  readonly hoveredFrameTitleId = signal<string | null>(null);
  readonly snapLines = signal<SnapLine[]>([]);
  private isResizing = false;
  private isRotating = false;
  private isAdjustingCornerRadius = false;
  private suppressNextCanvasClick = false;

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

  private cornerRadiusStart: CornerRadiusState = {
    absoluteX: 0,
    absoluteY: 0,
    width: 0,
    height: 0,
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

  // ── Tool Selection ────────────────────────────────────────

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

  // ── Page Management ───────────────────────────────────────

  addPage(): void {
    this.runWithHistory(() => {
      const page = this.el.createPage(this.el.getNextPageName(this.pages()));
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

  // ── Canvas Events ─────────────────────────────────────────

  onCanvasPointerDown(event: MouseEvent): void {
    const target = event.target as HTMLElement;
    if (!this.shouldStartPanning(event, target)) {
      return;
    }

    this.viewport.startPanning(event);
    this.isDragging = false;
    this.isResizing = false;
  }

  onCanvasClick(event: MouseEvent): void {
    if (this.suppressNextCanvasClick) {
      this.suppressNextCanvasClick = false;
      return;
    }

    if (this.viewport.isSpacePressed()) {
      return;
    }

    this.apiError.set(null);
    const tool = this.currentTool();
    if (tool === 'select') {
      const target = event.target as HTMLElement;
      if (this.isCanvasBackgroundTarget(target)) {
        this.selectedElementId.set(null);
      }
      return;
    }

    const pointer = this.viewport.getCanvasPoint(event, this.getCanvasElement());
    if (!pointer) {
      return;
    }

    const selectedFrame = this.el.getSelectedFrame(this.selectedElement());
    const frameBounds = selectedFrame
      ? this.el.getAbsoluteBounds(selectedFrame, this.elements())
      : null;

    const result = this.el.createElementAtPoint(
      tool,
      pointer,
      this.elements(),
      selectedFrame,
      frameBounds,
      this.viewport.frameTemplate(),
    );

    if (result.error) {
      this.apiError.set(result.error);
      return;
    }

    if (!result.element) {
      return;
    }

    const newElement = result.element;
    this.runWithHistory(() => {
      this.updateCurrentPageElements((elements) => [...elements, newElement]);
      this.selectedElementId.set(newElement.id);
      this.currentTool.set('select');
    });
  }

  // ── Element Events ────────────────────────────────────────

  onElementPointerDown(event: MouseEvent, id: string): void {
    const target = event.target as HTMLElement;
    if (this.shouldStartPanning(event, target)) {
      this.viewport.startPanning(event);
      this.isDragging = false;
      this.isResizing = false;
      return;
    }

    if (this.isResizing || this.isRotating || this.editingTextElementId() === id) {
      return;
    }

    const elementForTypeCheck = this.el.findElementById(id, this.elements());
    if (elementForTypeCheck?.type === 'frame') {
      // Frame body is not interactable — clicking it deselects, then stops
      if (this.currentTool() === 'select') {
        this.selectedElementId.set(null);
      }
      return;
    }

    event.stopPropagation();
    this.selectedElementId.set(id);

    if (this.currentTool() !== 'select') {
      const selectedFrame = this.el.getSelectedFrame(this.selectedElement());
      const clickedElement = this.el.findElementById(id, this.elements());
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

    const element = this.el.findElementById(id, this.elements());
    if (!element) {
      return;
    }

    const pointer = this.viewport.getCanvasPoint(event, this.getCanvasElement());
    if (!pointer) {
      return;
    }

    const bounds = this.el.getAbsoluteBounds(element, this.elements());
    this.beginGestureHistory();
    this.isDragging = true;
    this.dragOffset = {
      x: pointer.x - bounds.x,
      y: pointer.y - bounds.y,
    };
    this.dragStartAbsolute = { x: bounds.x, y: bounds.y };
  }

  onFrameTitlePointerDown(event: MouseEvent, id: string): void {
    event.stopPropagation();

    if (this.shouldStartPanning(event, event.target as HTMLElement)) {
      this.viewport.startPanning(event);
      return;
    }

    if (this.isResizing || this.isRotating) {
      return;
    }

    this.selectedElementId.set(id);

    if (this.currentTool() !== 'select') {
      this.currentTool.set('select');
      return;
    }

    const element = this.el.findElementById(id, this.elements());
    if (!element) {
      return;
    }

    const pointer = this.viewport.getCanvasPoint(event, this.getCanvasElement());
    if (!pointer) {
      return;
    }

    const bounds = this.el.getAbsoluteBounds(element, this.elements());
    this.beginGestureHistory();
    this.isDragging = true;
    this.dragOffset = { x: pointer.x - bounds.x, y: pointer.y - bounds.y };
    this.dragStartAbsolute = { x: bounds.x, y: bounds.y };
  }

  onElementDoubleClick(event: MouseEvent, id: string): void {
    event.stopPropagation();
    const element = this.el.findElementById(id, this.elements());
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
    this.history.beginTextEditHistory(() => this.createHistorySnapshot());
    const value = (event.target as HTMLTextAreaElement).value;
    this.updateCurrentPageElements((elements) =>
      elements.map((element) =>
        element.id === id ? { ...element, text: value } : element,
      ),
    );
  }

  onTextEditorBlur(id: string): void {
    this.history.commitTextEditHistory(() => this.createHistorySnapshot());
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
    this.history.commitTextEditHistory(() => this.createHistorySnapshot());
    this.editingTextElementId.set(null);
    if (this.selectedElementId() !== id) {
      this.selectedElementId.set(id);
    }
    (event.target as HTMLTextAreaElement | null)?.blur();
  }

  // ── Resize / Rotate / Corner Radius Handles ──────────────

  onSelectionOutlinePointerDown(event: MouseEvent, id: string): void {
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const w = rect.width;
    const h = rect.height;
    const t = 10; // border hit threshold in screen pixels

    const nearTop = y < t;
    const nearBottom = y > h - t;
    const nearLeft = x < t;
    const nearRight = x > w - t;

    if (!nearTop && !nearBottom && !nearLeft && !nearRight) {
      // Interior click — overlay doesn't bubble to canvas-element, so delegate drag manually
      this.onElementPointerDown(event, id);
      return;
    }

    let handle: HandlePosition;
    if (nearTop && nearLeft) handle = 'nw';
    else if (nearTop && nearRight) handle = 'ne';
    else if (nearBottom && nearLeft) handle = 'sw';
    else if (nearBottom && nearRight) handle = 'se';
    else if (nearTop) handle = 'n';
    else if (nearBottom) handle = 's';
    else if (nearLeft) handle = 'w';
    else handle = 'e';

    this.onResizeHandlePointerDown(event, id, handle);
  }

  onResizeHandlePointerDown(event: MouseEvent, id: string, handle: HandlePosition): void {
    event.stopPropagation();
    event.preventDefault();

    const element = this.el.findElementById(id, this.elements());
    if (!element) {
      return;
    }

    const pointer = this.viewport.getCanvasPoint(event, this.getCanvasElement());
    if (!pointer) {
      return;
    }

    const bounds = this.el.getAbsoluteBounds(element, this.elements());
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

    const element = this.el.findElementById(id, this.elements());
    if (!element) {
      return;
    }

    const pointer = this.viewport.getCanvasPoint(event, this.getCanvasElement());
    if (!pointer) {
      return;
    }

    const bounds = this.el.getAbsoluteBounds(element, this.elements());
    const centerX = bounds.x + element.width / 2;
    const centerY = bounds.y + element.height / 2;
    const startAngle = Math.atan2(pointer.y - centerY, pointer.x - centerX) * (180 / Math.PI);

    this.selectedElementId.set(id);
    this.beginGestureHistory();
    this.isDragging = false;
    this.isResizing = false;
    this.isRotating = true;
    this.rotateStart = {
      startAngle,
      initialRotation: element.rotation ?? 0,
      centerX,
      centerY,
      elementId: id,
    };
  }

  onCornerRadiusHandlePointerDown(event: MouseEvent, id: string): void {
    event.stopPropagation();
    event.preventDefault();

    const element = this.el.findElementById(id, this.elements());
    if (!element || !this.el.supportsCornerRadius(element)) {
      return;
    }

    const pointer = this.viewport.getCanvasPoint(event, this.getCanvasElement());
    if (!pointer) {
      return;
    }

    const bounds = this.el.getAbsoluteBounds(element, this.elements());
    this.selectedElementId.set(id);
    this.beginGestureHistory();
    this.isDragging = false;
    this.isResizing = false;
    this.isRotating = false;
    this.isAdjustingCornerRadius = true;
    this.cornerRadiusStart = {
      absoluteX: bounds.x,
      absoluteY: bounds.y,
      width: element.width,
      height: element.height,
      elementId: id,
    };
  }

  // ── Panel Event Handlers ──────────────────────────────────

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
          const nextElement: CanvasElement = { ...element, ...patch };
          this.el.normalizeElement(nextElement, elements);
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
          element.id === change.id ? { ...element, name: change.name } : element,
        ),
      );
    });
  }

  onLayerVisibilityToggled(elementId: string): void {
    this.runWithHistory(() => {
      this.updateCurrentPageElements((elements) =>
        elements.map((element) =>
          element.id === elementId
            ? { ...element, visible: element.visible === false }
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
        this.el.reorderLayerElements(
          elements,
          change.draggedId,
          change.targetId,
          change.position,
        ),
      );
    });
  }

  onFrameTemplateSelected(template: FrameTemplateSelection): void {
    this.viewport.frameTemplate.set({
      width: template.width,
      height: template.height,
    });

    const centerPoint = this.viewport.getViewportCenterCanvasPoint(this.getCanvasElement());
    const frame = this.el.createFrameAtCenter(
      centerPoint,
      template.width,
      template.height,
      template.name,
      this.elements(),
    );

    this.runWithHistory(() => {
      this.updateCurrentPageElements((elements) => [...elements, frame]);
      this.selectedElementId.set(frame.id);
      this.currentTool.set('select');
    });

    const bounds = this.el.getAbsoluteBounds(frame, [...this.elements()]);
    this.viewport.focusElement(frame, bounds, this.getCanvasElement());
  }

  setFramework(framework: SupportedFramework): void {
    this.selectedFramework.set(framework);
  }

  // ── Context Menu ──────────────────────────────────────────

  onCanvasContextMenu(event: MouseEvent): void {
    event.preventDefault();
    this.contextMenu.open(event.clientX, event.clientY, this.buildContextMenuCallbacks());
  }

  onElementContextMenu(event: MouseEvent, id: string): void {
    event.preventDefault();
    event.stopPropagation();
    this.selectedElementId.set(id);
    this.contextMenu.open(event.clientX, event.clientY, this.buildContextMenuCallbacks());
  }

  onLayerContextMenuRequested(event: { id: string; x: number; y: number }): void {
    this.selectedElementId.set(event.id);
    this.contextMenu.open(event.x, event.y, this.buildContextMenuCallbacks());
  }

  closeContextMenu(): void {
    this.contextMenu.close();
  }

  // ── Global Pointer Events ─────────────────────────────────

  @HostListener('window:pointermove', ['$event'])
  onPointerMove(event: MouseEvent): void {
    if (this.viewport.isPanning()) {
      this.viewport.updatePan(event);
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

    if (this.isAdjustingCornerRadius) {
      this.handleCornerRadiusPointerMove(event);
      return;
    }

    if (!this.isDragging) {
      return;
    }

    const selectedId = this.selectedElementId();
    if (!selectedId) {
      return;
    }

    const pointer = this.viewport.getCanvasPoint(event, this.getCanvasElement());
    if (!pointer) {
      return;
    }

    const elements = this.elements();
    const dragged = this.el.findElementById(selectedId, elements);
    if (!dragged) {
      return;
    }

    let absoluteX = pointer.x - this.dragOffset.x;
    let absoluteY = pointer.y - this.dragOffset.y;

    if (event.shiftKey) {
      const dx = Math.abs(absoluteX - this.dragStartAbsolute.x);
      const dy = Math.abs(absoluteY - this.dragStartAbsolute.y);
      if (dx >= dy) {
        absoluteY = this.dragStartAbsolute.y;
      } else {
        absoluteX = this.dragStartAbsolute.x;
      }
    }

    const { xCandidates, yCandidates } = buildSnapCandidates(
      selectedId,
      elements,
      (el, els) => this.el.getAbsoluteBounds(el, els),
    );
    const snap = computeSnappedPosition(
      absoluteX,
      absoluteY,
      dragged.width,
      dragged.height,
      xCandidates,
      yCandidates,
    );
    absoluteX = snap.x;
    absoluteY = snap.y;
    this.snapLines.set(snap.lines);

    this.updateCurrentPageElements((elements) =>
      elements.map((element) => {
        if (element.id !== selectedId) {
          return element;
        }

        if (element.type === 'frame') {
          return {
            ...element,
            x: roundToTwoDecimals(absoluteX),
            y: roundToTwoDecimals(absoluteY),
          };
        }

        const parent = this.el.findElementById(element.parentId ?? null, elements);
        if (!parent) {
          return {
            ...element,
            x: roundToTwoDecimals(absoluteX),
            y: roundToTwoDecimals(absoluteY),
          };
        }

        const parentBounds = this.el.getAbsoluteBounds(parent, elements);
        return {
          ...element,
          x: clamp(absoluteX - parentBounds.x, 0, parent.width - element.width),
          y: clamp(absoluteY - parentBounds.y, 0, parent.height - element.height),
        };
      }),
    );
  }

  @HostListener('window:pointerup')
  onPointerUp(): void {
    const shouldCommitGestureHistory =
      this.isDragging || this.isResizing || this.isRotating || this.isAdjustingCornerRadius;

    if (this.viewport.isPanning() && this.viewport.panMoved) {
      this.suppressNextCanvasClick = true;
    }

    this.viewport.endPan();
    this.isDragging = false;
    this.isResizing = false;
    this.isRotating = false;
    this.isAdjustingCornerRadius = false;
    this.snapLines.set([]);

    if (shouldCommitGestureHistory) {
      this.history.commitGestureHistory(() => this.createHistorySnapshot());
    }
  }

  // ── Wheel ─────────────────────────────────────────────────

  onCanvasWheel(event: WheelEvent): void {
    const canvas = event.currentTarget as HTMLElement | null;
    if (!canvas) {
      return;
    }
    event.preventDefault();
    this.viewport.handleWheel(event, canvas.getBoundingClientRect());
  }

  // ── Zoom Toolbar Delegates ────────────────────────────────

  zoomIn(): void {
    this.viewport.zoomIn();
  }

  zoomOut(): void {
    this.viewport.zoomOut();
  }

  resetZoom(): void {
    this.viewport.resetZoom();
  }

  zoomPercentage(): number {
    return this.viewport.zoomPercentage();
  }

  // ── Template Delegates (viewport) ─────────────────────────

  canvasViewportTransform(): string {
    return this.viewport.canvasViewportTransform();
  }

  canvasSceneTransform(): string {
    return this.viewport.canvasSceneTransform();
  }

  canvasBackgroundSize(): string {
    return this.viewport.canvasBackgroundSize();
  }

  canvasBackgroundPosition(): string {
    return this.viewport.canvasBackgroundPosition();
  }

  isPanReady(): boolean {
    return this.currentTool() === 'select' || this.viewport.isSpacePressed();
  }

  // ── Template Delegates (element) ──────────────────────────

  getElementBorderStyle(element: CanvasElement): string {
    return this.el.getElementStrokeStyle(element);
  }

  getElementOutlineStyle(_element: CanvasElement): string {
    return 'none';
  }

  getElementOutlineOffset(_element: CanvasElement): number {
    return 0;
  }

  getRenderedX(element: CanvasElement): number {
    return this.el.getAbsoluteBounds(element, this.elements()).x;
  }

  getRenderedY(element: CanvasElement): number {
    return this.el.getAbsoluteBounds(element, this.elements()).y;
  }

  getFrameTitle(element: CanvasElement): string {
    return this.el.getFrameTitle(element);
  }

  getFrameTitleFontSize(): number {
    return this.viewport.getScreenInvariantSize(12.5);
  }

  getFrameTitleOffset(): number {
    return this.viewport.getScreenInvariantSize(-24);
  }

  getSelectionOutlineInset(element: CanvasElement): number {
    const strokeOffset = element.stroke ? getStrokeWidth(element) : 0;
    return this.viewport.getScreenInvariantSize(-2) - strokeOffset;
  }

  getSelectionOutlineBorderWidth(): number {
    return this.viewport.getScreenInvariantSize(2);
  }

  getHoverOutlineBorderWidth(): number {
    return this.viewport.getScreenInvariantSize(3);
  }

  // ── Selection overlay: screen-space positioning (no sub-pixel squish) ──

  getOverlayLeft(el: CanvasElement): number {
    return roundToTwoDecimals(this.getRenderedX(el) * this.viewport.zoomLevel());
  }

  getOverlayTop(el: CanvasElement): number {
    return roundToTwoDecimals(this.getRenderedY(el) * this.viewport.zoomLevel());
  }

  getOverlayWidth(el: CanvasElement): number {
    return roundToTwoDecimals(el.width * this.viewport.zoomLevel());
  }

  getOverlayHeight(el: CanvasElement): number {
    return roundToTwoDecimals(el.height * this.viewport.zoomLevel());
  }

  // With global box-sizing: border-box, the 2px border is drawn INSIDE the div's width/height.
  // To place ring fully OUTSIDE the element: left/top -= 2, width/height += 4 (2px each side).
  getSelectionLeft(el: CanvasElement): number {
    return roundToTwoDecimals(this.getRenderedX(el) * this.viewport.zoomLevel() - 2);
  }

  getSelectionTop(el: CanvasElement): number {
    return roundToTwoDecimals(this.getRenderedY(el) * this.viewport.zoomLevel() - 2);
  }

  getSelectionWidth(el: CanvasElement): number {
    return roundToTwoDecimals(el.width * this.viewport.zoomLevel() + 4);
  }

  getSelectionHeight(el: CanvasElement): number {
    return roundToTwoDecimals(el.height * this.viewport.zoomLevel() + 4);
  }

  getOverlaySelLeft(el: CanvasElement): number {
    const strokeOffset = el.stroke ? getStrokeWidth(el) : 0;
    const zoom = this.viewport.zoomLevel();
    return roundToTwoDecimals(this.getRenderedX(el) * zoom - 2 - strokeOffset * zoom);
  }

  getOverlaySelTop(el: CanvasElement): number {
    const strokeOffset = el.stroke ? getStrokeWidth(el) : 0;
    const zoom = this.viewport.zoomLevel();
    return roundToTwoDecimals(this.getRenderedY(el) * zoom - 2 - strokeOffset * zoom);
  }

  getOverlaySelWidth(el: CanvasElement): number {
    const strokeOffset = el.stroke ? getStrokeWidth(el) : 0;
    const zoom = this.viewport.zoomLevel();
    return roundToTwoDecimals(el.width * zoom + 4 + 2 * strokeOffset * zoom);
  }

  getOverlaySelHeight(el: CanvasElement): number {
    const strokeOffset = el.stroke ? getStrokeWidth(el) : 0;
    const zoom = this.viewport.zoomLevel();
    return roundToTwoDecimals(el.height * zoom + 4 + 2 * strokeOffset * zoom);
  }

  getOverlayCornerRadiusInset(el: CanvasElement): number {
    const radius = Number.isFinite(el.cornerRadius ?? Number.NaN)
      ? (el.cornerRadius as number)
      : el.type === 'image' ? 6 : 0;
    const zoom = this.viewport.zoomLevel();
    const handleRadius = 6; // half of 12px handle size
    // Compute screen-space inset directly: handle center should be at (radius * zoom) px
    // from the element corner in screen space, so CSS top/right = radius*zoom - handleRadius.
    // minScreenInset keeps the handle visibly inside the corner even at radius=0.
    const minScreenInset = 8;
    const maxScreenInset = Math.max(0, Math.min(el.width, el.height) * zoom / 2 - handleRadius);
    return roundToTwoDecimals(clamp(radius * zoom - handleRadius, minScreenInset, maxScreenInset));
  }

  getResizeHandleSize(): number {
    return this.viewport.getScreenInvariantSize(12);
  }

  getResizeHandleBorderWidth(): number {
    return this.viewport.getScreenInvariantSize(2);
  }

  getResizeHandleOffset(): number {
    return this.viewport.getScreenInvariantSize(-8);
  }

  isTextEditing(elementId: string): boolean {
    return this.editingTextElementId() === elementId;
  }

  getElementClipPath(element: CanvasElement): string {
    return this.el.getElementClipPath(element, this.elements());
  }

  isElementClippedOut(element: CanvasElement): boolean {
    return this.el.isElementClippedOut(element, this.elements());
  }

  getTextFontFamily(element: CanvasElement): string {
    return this.el.getTextFontFamily(element);
  }

  getTextFontWeight(element: CanvasElement): number {
    return this.el.getTextFontWeight(element);
  }

  getTextFontStyle(element: CanvasElement): string {
    return this.el.getTextFontStyle(element);
  }

  getTextLineHeight(element: CanvasElement): number {
    return this.el.getTextLineHeight(element);
  }

  getTextLetterSpacing(element: CanvasElement): string {
    return this.el.getTextLetterSpacing(element);
  }

  getTextJustifyContent(element: CanvasElement): string {
    return this.el.getTextJustifyContent(element);
  }

  getTextAlignItems(element: CanvasElement): string {
    return this.el.getTextAlignItems(element);
  }

  getTextAlignValue(element: CanvasElement): string {
    return this.el.getTextAlignValue(element);
  }

  trackByElementId(_: number, element: CanvasElement): string {
    return element.id;
  }

  supportsCornerRadius(element: CanvasElement): boolean {
    return this.el.supportsCornerRadius(element);
  }

  getCornerRadiusHandleInset(element: CanvasElement): number {
    return this.el.getCornerRadiusHandleInset(element);
  }

  handleClass(handle: CornerHandle): string {
    return `handle-${handle}`;
  }

  cornerZoneClass(corner: CornerHandle): string {
    return `corner-zone-${corner}`;
  }

  getElementTransform(element: CanvasElement): string | null {
    return this.el.getElementTransform(element);
  }

  getCornerZoneSize(): number {
    return this.viewport.getScreenInvariantSize(24);
  }

  getCornerZoneOffset(): number {
    return this.viewport.getScreenInvariantSize(-12);
  }

  getEdgeHitThickness(): number {
    return this.viewport.getScreenInvariantSize(8);
  }

  getEdgeHitCornerGap(): number {
    return this.viewport.getScreenInvariantSize(16);
  }

  // ── Keyboard ──────────────────────────────────────────────

  @HostListener('window:keydown', ['$event'])
  handleKeyDown(event: KeyboardEvent): void {
    this.keyboard.handleKeyDown(event, this.buildKeyboardCallbacks());
  }

  @HostListener('window:keyup', ['$event'])
  handleKeyUp(event: KeyboardEvent): void {
    this.keyboard.handleKeyUp(event, () => this.viewport.isSpacePressed.set(false));
  }

  @HostListener('window:blur')
  handleWindowBlur(): void {
    this.viewport.isSpacePressed.set(false);
    this.viewport.endPan();
    this.isDragging = false;
    this.isResizing = false;
    this.isRotating = false;
    this.history.commitGestureHistory(() => this.createHistorySnapshot());
    this.history.commitTextEditHistory(() => this.createHistorySnapshot());
    this.editingTextElementId.set(null);
  }

  // ── Code Generation ───────────────────────────────────────

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

  // ── Private: Persistence ──────────────────────────────────

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
        const pages =
          response.pages.length > 0 ? response.pages : [this.el.createPage('Page 1')];
        const activePageId =
          response.activePageId && pages.some((page) => page.id === response.activePageId)
            ? response.activePageId
            : (pages[0]?.id ?? null);

        this.pages.set(pages);
        this.currentPageId.set(activePageId);
        this.selectedElementId.set(null);
        this.lastSavedAt.set(response.updatedAt ?? null);
        this.history.resetHistory();
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

    const document = buildCanvasProjectDocument(
      this.pages(),
      this.projectId,
      this.currentPageId(),
    );
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

  // ── Private: Gesture Handling ─────────────────────────────

  private handleRotatePointerMove(event: MouseEvent): void {
    const start = this.rotateStart;
    if (!start.elementId) {
      return;
    }

    const pointer = this.viewport.getCanvasPoint(event, this.getCanvasElement());
    if (!pointer) {
      return;
    }

    const currentAngle =
      Math.atan2(pointer.y - start.centerY, pointer.x - start.centerX) * (180 / Math.PI);
    const angleDelta = currentAngle - start.startAngle;
    let newRotation = start.initialRotation + angleDelta;

    if (event.shiftKey) {
      newRotation = Math.round(newRotation / 15) * 15;
    }

    newRotation = ((newRotation % 360) + 360) % 360;
    newRotation = roundToTwoDecimals(newRotation);

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

    const pointer = this.viewport.getCanvasPoint(event, this.getCanvasElement());
    if (!pointer) {
      return;
    }

    this.updateCurrentPageElements((elements) =>
      elements.map((element) => {
        if (element.id !== start.elementId) {
          return element;
        }

        const parent = this.el.findElementById(element.parentId ?? null, elements);
        const parentBounds = parent ? this.el.getAbsoluteBounds(parent, elements) : null;
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

        this.el.normalizeElement(nextElement, elements);
        return nextElement;
      }),
    );
  }

  private handleCornerRadiusPointerMove(event: MouseEvent): void {
    const start = this.cornerRadiusStart;
    if (!start.elementId) {
      return;
    }

    const pointer = this.viewport.getCanvasPoint(event, this.getCanvasElement());
    if (!pointer) {
      return;
    }

    const cornerX = start.absoluteX + start.width;
    const cornerY = start.absoluteY;
    const xRadius = cornerX - pointer.x;
    const yRadius = pointer.y - cornerY;
    const rawRadius = Math.min(xRadius, yRadius);
    const maxRadius = Math.max(0, Math.min(start.width, start.height) / 2);
    const nextRadius = clamp(rawRadius, 0, maxRadius);

    this.updateCurrentPageElements((elements) =>
      elements.map((element) => {
        if (element.id !== start.elementId || !this.el.supportsCornerRadius(element)) {
          return element;
        }
        return { ...element, cornerRadius: roundToTwoDecimals(nextRadius) };
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
    const minSize = 24;
    const deltaX = pointer.x - start.pointerX;
    const deltaY = pointer.y - start.pointerY;
    const isEdgeHandle =
      start.handle === 'n' || start.handle === 's' || start.handle === 'e' || start.handle === 'w';
    const isNS = start.handle === 'n' || start.handle === 's';
    const isEW = start.handle === 'e' || start.handle === 'w';
    const effectiveDeltaX = isNS ? 0 : deltaX;
    const effectiveDeltaY = isEW ? 0 : deltaY;
    const xDirection = start.handle.includes('w') ? -1 : 1;
    const yDirection = start.handle.includes('n') ? -1 : 1;
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
        minSize / 2,
        Math.min(start.centerX - minLeft, maxRight - start.centerX),
      );
      const maxHalfHeight = Math.max(
        minSize / 2,
        Math.min(start.centerY - minTop, maxBottom - start.centerY),
      );

      if (shouldPreserveAspectRatio) {
        const scaleX = candidateHalfWidth / Math.max(start.width / 2, 1);
        const scaleY = candidateHalfHeight / Math.max(start.height / 2, 1);
        const dominantScale = Math.abs(scaleX - 1) >= Math.abs(scaleY - 1) ? scaleX : scaleY;
        const minScale = Math.max(
          minSize / Math.max(start.width, 1),
          minSize / Math.max(start.height, 1),
        );
        const maxScale = Math.min(
          (maxHalfWidth * 2) / Math.max(start.width, 1),
          (maxHalfHeight * 2) / Math.max(start.height, 1),
        );
        const scale = clamp(dominantScale, minScale, Math.max(minScale, maxScale));
        const width = roundToTwoDecimals(start.width * scale);
        const height = roundToTwoDecimals(width / aspectRatio);

        return {
          x: roundToTwoDecimals(start.centerX - width / 2),
          y: roundToTwoDecimals(start.centerY - height / 2),
          width,
          height,
        };
      }

      const halfWidth = clamp(candidateHalfWidth, minSize / 2, maxHalfWidth);
      const halfHeight = clamp(candidateHalfHeight, minSize / 2, maxHalfHeight);

      return {
        x: roundToTwoDecimals(start.centerX - halfWidth),
        y: roundToTwoDecimals(start.centerY - halfHeight),
        width: roundToTwoDecimals(halfWidth * 2),
        height: roundToTwoDecimals(halfHeight * 2),
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
        minSize / Math.max(start.width, 1),
        minSize / Math.max(start.height, 1),
      );
      const maxScale = Math.min(
        (start.handle.includes('w') ? right - minLeft : maxRight - left) /
          Math.max(start.width, 1),
        (start.handle.includes('n') ? bottom - minTop : maxBottom - top) /
          Math.max(start.height, 1),
      );
      const scale = clamp(dominantScale, minScale, Math.max(minScale, maxScale));
      const width = roundToTwoDecimals(start.width * scale);
      const height = roundToTwoDecimals(width / aspectRatio);

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
        x: roundToTwoDecimals(left),
        y: roundToTwoDecimals(top),
        width: roundToTwoDecimals(right - left),
        height: roundToTwoDecimals(bottom - top),
      };
    }

    if (start.handle.includes('w')) {
      left = clamp(start.absoluteX + deltaX, minLeft, right - minSize);
    }

    if (start.handle.includes('e')) {
      right = clamp(start.absoluteX + start.width + deltaX, left + minSize, maxRight);
    }

    if (start.handle.includes('n')) {
      top = clamp(start.absoluteY + deltaY, minTop, bottom - minSize);
    }

    if (start.handle.includes('s')) {
      bottom = clamp(start.absoluteY + start.height + deltaY, top + minSize, maxBottom);
    }

    return {
      x: roundToTwoDecimals(left),
      y: roundToTwoDecimals(top),
      width: roundToTwoDecimals(right - left),
      height: roundToTwoDecimals(bottom - top),
    };
  }

  // ── Private: Helpers ──────────────────────────────────────

  private updateCurrentPageElements(
    updater: (elements: CanvasElement[]) => CanvasElement[],
  ): void {
    const currentPageId = this.currentPageId();
    if (!currentPageId) {
      return;
    }

    this.pages.update((pages) =>
      this.el.updatePageElements(pages, currentPageId, updater),
    );
  }

  private shouldStartPanning(event: MouseEvent, target: HTMLElement): boolean {
    if (event.button === 1) {
      return true;
    }
    if (event.button !== 0) {
      return false;
    }
    if (this.viewport.isSpacePressed()) {
      return true;
    }
    return this.currentTool() === 'select' && this.isCanvasBackgroundTarget(target);
  }

  private isCanvasBackgroundTarget(target: HTMLElement): boolean {
    return (
      target.classList.contains('canvas-container') ||
      target.classList.contains('canvas-viewport') ||
      target.classList.contains('canvas-scene')
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

  // ── Private: History Shortcuts ────────────────────────────

  private runWithHistory(action: () => void): void {
    this.history.runWithHistory(() => this.createHistorySnapshot(), action);
  }

  private beginGestureHistory(): void {
    this.history.beginGestureHistory(() => this.createHistorySnapshot());
  }

  private createHistorySnapshot(): HistorySnapshot {
    return {
      pages: structuredClone(this.pages()),
      currentPageId: this.currentPageId(),
      selectedElementId: this.selectedElementId(),
    };
  }

  private applyHistorySnapshot(snapshot: HistorySnapshot): void {
    this.pages.set(structuredClone(snapshot.pages));
    this.currentPageId.set(snapshot.currentPageId);
    this.selectedElementId.set(snapshot.selectedElementId);
    this.currentTool.set('select');
    this.editingTextElementId.set(null);
  }

  // ── Private: Clipboard ────────────────────────────────────

  private copySelectedElement(): void {
    const selectedId = this.selectedElementId();
    if (!selectedId) {
      return;
    }
    this.clipboard.copySubtree(selectedId, this.elements(), this.currentPageId());
    this.apiError.set(null);
  }

  private pasteClipboard(): void {
    if (!this.clipboard.hasClipboard || !this.currentPage()) {
      return;
    }

    const selectedFrame = this.el.getSelectedFrame(this.selectedElement());
    const { parentId: targetParentId, error } = this.clipboard.resolvePasteParentId(
      this.elements(),
      selectedFrame,
    );

    if (error) {
      this.apiError.set(error);
      return;
    }

    const pastedElements = this.clipboard.paste(this.elements(), targetParentId);
    if (!pastedElements || pastedElements.length === 0) {
      return;
    }

    this.runWithHistory(() => {
      this.updateCurrentPageElements((elements) => [...elements, ...pastedElements]);
      this.selectedElementId.set(pastedElements[0]?.id ?? null);
      this.editingTextElementId.set(null);
      this.currentTool.set('select');
    });

    this.apiError.set(null);
  }

  private deleteSelectedElement(): void {
    const selectedId = this.selectedElementId();
    if (!selectedId) {
      return;
    }
    this.runWithHistory(() => {
      this.updateCurrentPageElements((elements) =>
        this.el.removeElementWithChildren(elements, selectedId),
      );
      this.selectedElementId.set(null);
    });
  }

  // ── Private: Context Menu Actions ─────────────────────────

  private bringToFront(elementId: string): void {
    this.runWithHistory(() => {
      this.updateCurrentPageElements((elements) => {
        const index = elements.findIndex((el) => el.id === elementId);
        if (index === -1) return elements;
        const next = [...elements];
        const [moved] = next.splice(index, 1);
        next.push(moved);
        return next;
      });
    });
  }

  private sendToBack(elementId: string): void {
    this.runWithHistory(() => {
      this.updateCurrentPageElements((elements) => {
        const el = elements.find((e) => e.id === elementId);
        if (!el) return elements;

        const withoutEl = elements.filter((e) => e.id !== elementId);
        const parentId = el.parentId ?? null;

        if (parentId !== null || el.type === 'frame') {
          const firstSiblingIdx = withoutEl.findIndex(
            (e) => (e.parentId ?? null) === parentId,
          );
          const insertAt = firstSiblingIdx === -1 ? 0 : firstSiblingIdx;
          const result = [...withoutEl];
          result.splice(insertAt, 0, el);
          return result;
        }

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

  private moveToPage(elementId: string, targetPageId: string): void {
    const subtreeIds = new Set(this.clipboard.collectSubtreeIds(this.elements(), elementId));
    const elementsToMove = this.elements().filter((el) => subtreeIds.has(el.id));
    if (elementsToMove.length === 0) return;

    this.runWithHistory(() => {
      this.updateCurrentPageElements((elements) =>
        elements.filter((el) => !subtreeIds.has(el.id)),
      );
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

  private flipHorizontal(elementId: string): void {
    this.runWithHistory(() => {
      this.updateCurrentPageElements((elements) =>
        elements.map((el) => {
          if (el.id !== elementId) return el;
          const currentScale = (el as CanvasElement & { scaleX?: number }).scaleX ?? 1;
          return { ...el, scaleX: currentScale === -1 ? 1 : -1 } as CanvasElement;
        }),
      );
    });
  }

  private flipVertical(elementId: string): void {
    this.runWithHistory(() => {
      this.updateCurrentPageElements((elements) =>
        elements.map((el) => {
          if (el.id !== elementId) return el;
          const currentScale = (el as CanvasElement & { scaleY?: number }).scaleY ?? 1;
          return { ...el, scaleY: currentScale === -1 ? 1 : -1 } as CanvasElement;
        }),
      );
    });
  }

  // ── Private: Callback Builders ────────────────────────────

  private buildKeyboardCallbacks(): KeyboardActionCallbacks {
    return {
      onCopy: () => this.copySelectedElement(),
      onPaste: () => this.pasteClipboard(),
      onUndo: () =>
        this.history.undo(
          () => this.createHistorySnapshot(),
          (snapshot) => this.applyHistorySnapshot(snapshot),
        ),
      onRedo: () =>
        this.history.redo(
          () => this.createHistorySnapshot(),
          (snapshot) => this.applyHistorySnapshot(snapshot),
        ),
      onDelete: () => this.deleteSelectedElement(),
      onSelectTool: (tool) => this.selectTool(tool),
      onSpaceDown: () => this.viewport.isSpacePressed.set(true),
      onSpaceUp: () => this.viewport.isSpacePressed.set(false),
      getEditingTextElementId: () => this.editingTextElementId(),
      getSelectedElementId: () => this.selectedElementId(),
    };
  }

  private buildContextMenuCallbacks(): ContextMenuActionCallbacks {
    return {
      getSelectedElementId: () => this.selectedElementId(),
      getSelectedElement: () => this.selectedElement(),
      getPages: () => this.pages(),
      getCurrentPageId: () => this.currentPageId(),
      getElements: () => this.elements(),
      onCopy: () => this.copySelectedElement(),
      onPaste: () => this.pasteClipboard(),
      onDelete: (id) => {
        this.runWithHistory(() => {
          this.updateCurrentPageElements((elements) =>
            this.el.removeElementWithChildren(elements, id),
          );
          this.selectedElementId.set(null);
        });
      },
      onBringToFront: (id) => this.bringToFront(id),
      onSendToBack: (id) => this.sendToBack(id),
      onMoveToPage: (id, pageId) => this.moveToPage(id, pageId),
      onFlipHorizontal: (id) => this.flipHorizontal(id),
      onFlipVertical: (id) => this.flipVertical(id),
      onRename: (id) => {
        window.dispatchEvent(
          new CustomEvent('canvas:rename-request', { detail: { id } }),
        );
      },
      onToggleVisibility: (id) => this.onLayerVisibilityToggled(id),
    };
  }
}
