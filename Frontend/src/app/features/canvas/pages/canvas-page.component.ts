import {
  AfterViewChecked,
  Component,
  ElementRef,
  HostListener,
  NgZone,
  OnDestroy,
  ViewChild,
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
  IRNode,
  ConverterPageRequest,
  extractApiErrorMessage,
} from '@app/core';
import {
  buildCanvasIR,
  buildCanvasIRPages,
  buildCanvasProjectDocument,
} from '../mappers/canvas-ir.mapper';
import { HeaderBarComponent, ContextMenuComponent, DialogBoxComponent } from '@app/shared';
import type { ContextMenuItem } from '@app/shared';
import { ToolbarComponent } from '../components/toolbar/toolbar.component';
import { ProjectPanelComponent } from '../components/project-panel/project-panel.component';
import { PropertiesPanelComponent } from '../components/properties-panel/properties-panel.component';
import { getStrokeWidth, mutateNormalizeElement } from '../utils/canvas-interaction.util';
import { clamp, roundToTwoDecimals } from '../utils/canvas-math.util';
import { collectSubtreeIds, removeWithChildren } from '../utils/canvas-interaction.util';
import {
  buildSnapCandidates,
  computeSnappedPosition,
  SNAP_THRESHOLD,
} from '../utils/canvas-snap.util';
import { generateThumbnail } from '../utils/canvas-thumbnail.util';
import { calculateResizedBounds } from '../utils/canvas-resize.util';
import {
  getTextFontFamily,
  getTextFontWeight,
  getTextFontStyle,
  getTextFontSize,
  getTextLineHeight,
  getTextLetterSpacing,
  getTextAlignValue,
  getFrameTitle,
} from '../utils/canvas-text.util';
import { CanvasPersistenceService, CanvasGenerationService } from '../services/canvas-api.service';
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
  PageCanvasLayout,
  PageDragState,
} from '../canvas.types';
import { CanvasViewportService } from '../services/canvas-viewport.service';
import { CanvasHistoryService } from '../services/canvas-history.service';
import { CanvasClipboardService } from '../services/canvas-clipboard.service';
import { CanvasElementService } from '../services/canvas-element.service';
import {
  CanvasKeyboardService,
  KeyboardActionCallbacks,
} from '../services/canvas-keyboard.service';
import {
  CanvasContextMenuService,
  ContextMenuActionCallbacks,
} from '../services/canvas-context-menu.service';
import { CanvasEditorStateService } from '../services/canvas-editor-state.service';
import { CanvasPageService } from '../services/canvas-page.service';
import { CanvasPageGeometryService } from '../services/canvas-page-geometry.service';

const ROOT_FRAME_INSERT_GAP = 48;
const PAGE_SHELL_HEADER_TO_FRAME_TITLE_GAP = 52;
const PAGE_FRAME_TITLE_OFFSET = 24;
const PAGE_SHELL_HEADER_HEIGHT = 32;
const FRAME_TITLE_MIN_ZOOM = 0.62;
const ELEMENT_DRAG_START_THRESHOLD = 3;

interface RectangleDrawState {
  startPoint: Point;
  currentPoint: Point;
  containerId: string | null;
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
    DialogBoxComponent,
  ],
  providers: [
    CanvasEditorStateService,
    CanvasViewportService,
    CanvasHistoryService,
    CanvasClipboardService,
    CanvasElementService,
    CanvasKeyboardService,
    CanvasContextMenuService,
    CanvasPersistenceService,
    CanvasGenerationService,
    CanvasPageGeometryService,
    CanvasPageService,
  ],
  templateUrl: './canvas-page.component.html',
  styleUrl: './canvas-page.component.css',
})
export class CanvasPage implements OnDestroy, AfterViewChecked {
  private readonly route = inject(ActivatedRoute);
  private readonly canvasPersistenceService = inject(CanvasPersistenceService);
  readonly gen = inject(CanvasGenerationService);
  private readonly zone = inject(NgZone);

  readonly viewport = inject(CanvasViewportService);
  private readonly history = inject(CanvasHistoryService);
  private readonly clipboard = inject(CanvasClipboardService);
  readonly el = inject(CanvasElementService);
  private readonly keyboard = inject(CanvasKeyboardService);
  readonly contextMenu = inject(CanvasContextMenuService);
  readonly editorState = inject(CanvasEditorStateService);
  readonly page = inject(CanvasPageService);
  readonly pageLayout = inject(CanvasPageGeometryService);
  private isPropertyNumberGestureActive = false;

  @ViewChild('canvasScene', { static: false }) canvasSceneRef?: ElementRef<HTMLElement>;
  private flowBoundsCache = new Map<string, Bounds>();
  private flowBoundsDirty = true;
  private readonly flowCacheVersion = signal(0);

  // ── Core State ────────────────────────────────────────────

  readonly pages = this.editorState.pages;
  readonly currentPageId = this.editorState.currentPageId;
  readonly selectedElementId = this.editorState.selectedElementId;
  readonly selectedElementIds = this.editorState.selectedElementIds;
  readonly editingTextElementId = this.editorState.editingTextElementId;
  readonly currentTool = this.editorState.currentTool;

  // ── Computed Signals ──────────────────────────────────────

  readonly currentPage = this.editorState.currentPage;
  readonly elements = this.editorState.elements;
  readonly selectedElement = this.editorState.selectedElement;
  readonly selectedElements = this.editorState.selectedElements;

  readonly visibleElements = computed<CanvasElement[]>(() =>
    this.elements().filter((element) =>
      this.el.isElementEffectivelyVisible(element.id, this.elements()),
    ),
  );

  /** Elements rendered at the top level (flat). Excludes children of any container. */
  readonly topLevelVisibleElements = computed<CanvasElement[]>(() => {
    const all = this.visibleElements();
    return all.filter((el) => !this.hasContainerAncestor(el, all));
  });

  readonly currentPageName = computed(() => this.currentPage()?.name ?? 'Untitled page');
  readonly cornerHandles: CornerHandle[] = ['nw', 'ne', 'sw', 'se'];

  // ── API / Generation State ────────────────────────────────

  readonly apiError = this.page.apiError;
  readonly isLoadingDesign = signal(false);
  readonly isSavingDesign = signal(false);
  readonly lastSavedAt = signal<string | null>(null);

  readonly irPreview = computed<IRNode>(() => {
    const currentPage = this.currentPage();
    return buildCanvasIR(this.visibleElements(), this.projectId, currentPage?.name);
  });

  readonly irPages = computed<ConverterPageRequest[]>(() =>
    buildCanvasIRPages(this.pages(), this.projectId),
  );

  readonly projectId = this.route.snapshot.paramMap.get('id') ?? 'new-project';

  // ── Gesture State (local, not service-worthy) ─────────────

  private readonly projectIdAsNumber = Number.parseInt(this.projectId, 10);
  private canPersistDesign = false;
  private saveTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private dragOffset: Point = { x: 0, y: 0 };
  private dragStartAbsolute: Point = { x: 0, y: 0 };
  private dragSelectionIds: string[] = [];
  private dragSelectionStartBounds = new Map<string, Bounds>();
  private _isDragging = false;
  private get isDragging(): boolean {
    return this._isDragging;
  }
  private set isDragging(value: boolean) {
    this._isDragging = value;
    this.isDraggingEl.set(value);
  }
  readonly isDraggingEl = signal(false);
  readonly hoveredElementId = signal<string | null>(null);
  readonly hoveredFrameTitleId = signal<string | null>(null);
  readonly snapLines = signal<SnapLine[]>([]);
  readonly rectangleDrawPreview = signal<Bounds | null>(null);
  readonly flowDragPlaceholder = signal<{ elementId: string; bounds: Bounds } | null>(null);
  readonly isFrameReorderAnimating = signal(false);
  readonly draggingFlowChildId = signal<string | null>(null);
  readonly layoutDropTarget = signal<{ containerId: string; index: number } | null>(null);
  private hasMovedElementDuringDrag = false;
  private rectangleDrawState: RectangleDrawState | null = null;
  private isFlowDragInsideContainer = false;
  private isResizing = false;
  private isRotating = false;
  private isAdjustingCornerRadius = false;
  private isDraggingPage = false;
  private hasMovedPageDuringDrag = false;
  private suppressNextPageShellClick = false;
  private frameReorderAnimationTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private pageDragState: PageDragState = {
    pageId: '',
    pointerX: 0,
    pointerY: 0,
    startX: 0,
    startY: 0,
  };
  private suppressNextCanvasClick = false;
  private resizeSubtreeSnapshot = new Map<string, CanvasElement>();

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

    // Invalidate flow bounds cache whenever elements change so the selection
    // overlay stays accurate for flow children (flex/grid layout containers).
    effect(() => {
      this.elements();
      this.flowBoundsCache = new Map();
      this.flowBoundsDirty = true;
    });
  }

  ngAfterViewChecked(): void {
    this.page.setCanvasElement(this.getCanvasElement());

    if (this.flowBoundsDirty) {
      this.flowBoundsDirty = false;
      this.zone.runOutsideAngular(() => this.updateFlowBoundsCache());
      // Defer the version bump to the next microtask so the template re-evaluates
      // after the DOM measurements are done, without writing a signal mid-check.
      Promise.resolve().then(() => this.flowCacheVersion.update((v) => v + 1));
    }
  }

  ngOnDestroy(): void {
    if (this.saveTimeoutId) {
      clearTimeout(this.saveTimeoutId);
      this.saveTimeoutId = null;
    }

    if (this.frameReorderAnimationTimeoutId) {
      clearTimeout(this.frameReorderAnimationTimeoutId);
      this.frameReorderAnimationTimeoutId = null;
    }

    this.persistThumbnailIfDue();
  }

  // ── Tool Selection ────────────────────────────────────────

  onToolbarToolSelected(tool: CanvasElementType | 'select'): void {
    if (tool === 'frame') {
      this.page.addPage();
      return;
    }

    this.selectTool(tool);
  }

  selectTool(tool: CanvasElementType | 'select'): void {
    this.clearRectangleDraw();
    this.currentTool.set(tool);
    if (tool === 'select') {
      return;
    }

    const selected = this.selectedElement();
    const shouldKeepSelection = tool !== 'frame' && this.el.isContainerElement(selected);
    if (!shouldKeepSelection) {
      this.selectedElementId.set(null);
    }
  }

  // ── Page Management (gesture-coupled handlers stay here) ──

  onActivePageShellClick(pageId: string): void {
    if (this.suppressNextPageShellClick) {
      this.suppressNextPageShellClick = false;
      return;
    }

    this.page.onActivePageShellClick(pageId);
  }

  onInactivePageShellClick(pageId: string): void {
    if (this.suppressNextPageShellClick) {
      this.suppressNextPageShellClick = false;
      return;
    }

    this.page.selectPage(pageId);
  }

  onPageNamePointerDown(event: MouseEvent, pageId: string): void {
    if (this.page.editingCanvasHeaderPageId() === pageId) {
      event.stopPropagation();
      return;
    }

    if (event.button !== 0) {
      return;
    }

    const layout = this.page.getPageLayoutById(pageId);
    if (!layout) {
      return;
    }

    this.startPageDrag(event, pageId, layout);
  }

  onPageShellPointerDown(event: MouseEvent, pageId: string): void {
    if (event.button !== 0) {
      return;
    }

    const target = event.target as HTMLElement | null;
    if (!target) {
      return;
    }

    if (target.closest('.page-shell-header')) {
      return;
    }

    if (pageId === this.currentPageId() && this.startRectangleDraw(event, true)) {
      return;
    }

    const layout = this.page.getPageLayoutById(pageId);
    if (!layout) {
      return;
    }

    this.startPageDrag(event, pageId, layout);
  }

  private startPageDrag(event: MouseEvent, pageId: string, layout: PageCanvasLayout): void {
    const pointer = this.viewport.getCanvasPoint(event, this.getCanvasElement());
    if (!pointer) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    this.hasMovedPageDuringDrag = false;
    this.beginGestureHistory();
    this.isDraggingPage = true;
    this.pageDragState = {
      pageId,
      pointerX: pointer.x,
      pointerY: pointer.y,
      startX: layout.x,
      startY: layout.y,
    };
  }

  // ── Canvas Events ─────────────────────────────────────────

  onCanvasPointerDown(event: MouseEvent): void {
    const target = event.target as HTMLElement;
    if (this.isCanvasBackgroundTarget(target)) {
      this.page.clearSelectedPageLayer();
      this.page.layersFocusedPageId.set(null);
    }
    if (!this.shouldStartPanning(event, target)) {
      if (this.startRectangleDraw(event)) {
        return;
      }

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
        // commit text editing if active
        const editingId = this.editingTextElementId();
        if (editingId) {
          this.history.commitTextEditHistory(() => this.createHistorySnapshot());
          this.discardEmptyTextElement(editingId);
          this.editingTextElementId.set(null);
        }
        this.page.clearSelectedPageLayer();
        this.clearElementSelection();
        this.page.layersFocusedPageId.set(null);
      }
      return;
    }

    this.page.clearSelectedPageLayer();
    this.page.layersFocusedPageId.set(this.currentPageId());

    const pointer = this.getActivePageCanvasPoint(event);
    if (!pointer) {
      return;
    }

    const targetContainer = this.resolveInsertionContainer(pointer);
    const containerBounds = targetContainer
      ? this.el.getAbsoluteBounds(targetContainer, this.elements(), this.currentPage())
      : null;

    const newElement = this.createElementAtCanvasPoint(
      tool,
      pointer,
      targetContainer,
      containerBounds,
    );
    if (!newElement) {
      return;
    }
  }

  // ── Element Events ────────────────────────────────────────

  onElementPointerDown(event: MouseEvent, id: string): void {
    const target = event.target as HTMLElement;
    this.flowDragPlaceholder.set(null);

    if (this.shouldStartPanning(event, target)) {
      this.viewport.startPanning(event);
      this.isDragging = false;
      this.isResizing = false;
      return;
    }

    if (this.startRectangleDraw(event)) {
      return;
    }

    if (this.isResizing || this.isRotating || this.editingTextElementId() === id) {
      return;
    }

    // Exit text editing if clicking a different element
    const editingId = this.editingTextElementId();
    if (editingId && editingId !== id) {
      this.history.commitTextEditHistory(() => this.createHistorySnapshot());
      this.discardEmptyTextElement(editingId);
      this.editingTextElementId.set(null);
    }

    const elementForTypeCheck = this.el.findElementById(id, this.elements());

    this.page.clearSelectedPageLayer();

    if (event.shiftKey && this.currentTool() === 'select') {
      event.preventDefault();
      event.stopPropagation();
      this.page.layersFocusedPageId.set(this.currentPageId());
      this.toggleElementSelection(id);
      return;
    }

    if (
      elementForTypeCheck?.type === 'frame' &&
      !elementForTypeCheck.parentId &&
      !this.isElementSelected(id)
    ) {
      event.preventDefault();
      event.stopPropagation();
      this.page.layersFocusedPageId.set(this.currentPageId());
      this.clearElementSelection();
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    this.page.layersFocusedPageId.set(this.currentPageId());
    if (!this.isElementSelected(id)) {
      this.selectOnlyElement(id);
    } else {
      this.selectedElementId.set(id);
    }

    if (this.currentTool() !== 'select') {
      const selectedContainer = this.el.getSelectedContainer(this.selectedElement());
      const clickedElement = this.el.findElementById(id, this.elements());
      if (
        selectedContainer &&
        clickedElement?.id === selectedContainer.id &&
        this.el.isContainerElement(clickedElement)
      ) {
        return;
      }
      this.currentTool.set('select');
      return;
    }

    const element = elementForTypeCheck ?? this.el.findElementById(id, this.elements());
    if (!element) {
      return;
    }

    if (this.isRootFrame(element) && this.getRootFrameCount(this.elements()) <= 1) {
      return;
    }

    const pointer = this.getActivePageCanvasPoint(event);
    if (!pointer) {
      return;
    }

    let bounds = this.el.getAbsoluteBounds(element, this.elements(), this.currentPage());
    this.captureDragSelectionState(id);
    const isGroupDrag = this.dragSelectionIds.length > 1;

    // Detect flow child inside layout container — use visual position from cache
    const parent = this.el.findElementById(element.parentId ?? null, this.elements());
    if (!isGroupDrag && parent && this.isLayoutContainer(parent) && this.isChildInFlow(element)) {
      this.draggingFlowChildId.set(element.id);
      const liveSceneBounds = this.getLiveOverlaySceneBounds(element);
      const liveCanvasBounds = this.getLiveElementCanvasBounds(element);
      const cached = this.flowBoundsCache.get(element.id);
      this.setFlowDragPlaceholder(element, liveSceneBounds ?? cached ?? null);
      this.layoutDropTarget.set({
        containerId: parent.id,
        index: this.getFlowChildIndex(parent.id, element.id, this.elements()),
      });
      this.isFlowDragInsideContainer = true;
      bounds = liveCanvasBounds ?? bounds;
    }

    this.beginGestureHistory();
    this.hasMovedElementDuringDrag = false;
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

    this.page.clearSelectedPageLayer();
    if (event.shiftKey && this.currentTool() === 'select') {
      event.preventDefault();
      this.page.layersFocusedPageId.set(this.currentPageId());
      this.toggleElementSelection(id);
      return;
    }

    if (!this.isElementSelected(id)) {
      this.selectOnlyElement(id);
    } else {
      this.selectedElementId.set(id);
    }
    this.page.layersFocusedPageId.set(this.currentPageId());

    if (this.currentTool() !== 'select') {
      this.currentTool.set('select');
      return;
    }

    const element = this.el.findElementById(id, this.elements());
    if (!element) {
      return;
    }

    const pointer = this.getActivePageCanvasPoint(event);
    if (!pointer) {
      return;
    }

    const bounds = this.el.getAbsoluteBounds(element, this.elements(), this.currentPage());
    this.captureDragSelectionState(id);
    this.beginGestureHistory();
    this.hasMovedElementDuringDrag = false;
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
    this.page.clearSelectedPageLayer();
    this.page.layersFocusedPageId.set(this.currentPageId());
    this.selectOnlyElement(id);
    this.editingTextElementId.set(id);
    this.focusInlineTextEditor(id);
  }

  onTextEditorPointerDown(event: MouseEvent): void {
    event.stopPropagation();
  }

  onTextEditorInput(id: string, event: Event): void {
    this.history.beginTextEditHistory(() => this.createHistorySnapshot());
    const value = (event.target as HTMLTextAreaElement).value;
    this.updateCurrentPageElements((elements) => {
      let effectivePatch: Partial<CanvasElement> = { text: value };
      const withText = elements.map((element) => {
        if (element.id !== id) return element;
        const updated = { ...element, text: value };
        if (value) {
          const size = this.measureTextSize(updated);
          // Re-center x so the visual midpoint stays fixed as width changes
          const centerX = element.x + element.width / 2;
          const newX = roundToTwoDecimals(centerX - size.width / 2);
          effectivePatch = { text: value, x: newX, width: size.width, height: size.height };
          return { ...updated, x: newX, width: size.width, height: size.height };
        }
        return updated;
      });
      const editedEl = withText.find((e) => e.id === id);
      if (editedEl?.primarySyncId) {
        return withText.map((e) => (e.id === id ? { ...e, primarySyncId: undefined } : e));
      }
      return this.syncElementPatchToPrimary(id, effectivePatch, withText);
    });
  }

  onTextEditorBlur(id: string): void {
    this.history.commitTextEditHistory(() => this.createHistorySnapshot());
    if (this.editingTextElementId() === id) {
      this.editingTextElementId.set(null);
    }
    this.discardEmptyTextElement(id);
  }

  onTextEditorKeyDown(event: KeyboardEvent, id: string): void {
    event.stopPropagation();
    if (event.key !== 'Escape') {
      return;
    }
    event.preventDefault();
    this.history.commitTextEditHistory(() => this.createHistorySnapshot());
    const removed = this.discardEmptyTextElement(id);
    this.editingTextElementId.set(null);
    if (!removed && this.selectedElementId() !== id) {
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
      // Interior click — find the topmost element at this canvas point.
      // The selection-outline (z-index:10) sits above all element divs, so without
      // this hit-test clicking on an overlapping element would always re-select/drag
      // the already-selected one instead.
      const pointer = this.getActivePageCanvasPoint(event);
      const topId = pointer ? this.getTopElementIdAtPoint(pointer.x, pointer.y) : null;
      this.onElementPointerDown(event, topId ?? id);
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

    const pointer = this.getActivePageCanvasPoint(event);
    if (!pointer) {
      return;
    }

    const bounds = this.el.getAbsoluteBounds(element, this.elements(), this.currentPage());
    this.captureResizeSubtreeSnapshot(id, this.elements());
    this.selectOnlyElement(id);
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

    const pointer = this.getActivePageCanvasPoint(event);
    if (!pointer) {
      return;
    }

    const bounds = this.el.getAbsoluteBounds(element, this.elements(), this.currentPage());
    const centerX = bounds.x + element.width / 2;
    const centerY = bounds.y + element.height / 2;
    const startAngle = Math.atan2(pointer.y - centerY, pointer.x - centerX) * (180 / Math.PI);

    this.selectOnlyElement(id);
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

    const pointer = this.getActivePageCanvasPoint(event);
    if (!pointer) {
      return;
    }

    const bounds =
      this.getLiveElementCanvasBounds(element) ??
      this.el.getAbsoluteBounds(element, this.elements(), this.currentPage());
    this.selectOnlyElement(id);
    this.beginGestureHistory();
    this.isDragging = false;
    this.isResizing = false;
    this.isRotating = false;
    this.isAdjustingCornerRadius = true;
    this.cornerRadiusStart = {
      absoluteX: bounds.x,
      absoluteY: bounds.y,
      width: bounds.width,
      height: bounds.height,
      elementId: id,
    };
  }

  // ── Panel Event Handlers ──────────────────────────────────

  onSelectedElementPatch(patch: Partial<CanvasElement>): void {
    const selectedId = this.selectedElementId();
    if (!selectedId) {
      return;
    }

    const applyPatch = (): void => {
      this.updateCurrentPageElements((elements) => {
        let effectivePatch = patch;
        let layoutTransitionContainerIds: string[] = [];
        const withPatch = elements.map((element) => {
          if (element.id !== selectedId) {
            return element;
          }
          let nextElement: CanvasElement = { ...element, ...patch };
          mutateNormalizeElement(nextElement, elements);

          if (this.didContainerLayoutStateChange(element, nextElement)) {
            layoutTransitionContainerIds = [element.id];
          }

          const textLayoutPatch = this.getAutoSizedTextLayoutPatch(element, nextElement, patch);
          if (textLayoutPatch) {
            nextElement = { ...nextElement, ...textLayoutPatch };
            effectivePatch = { ...patch, ...textLayoutPatch };
          }

          return nextElement;
        });
        const patchedEl = withPatch.find((e) => e.id === selectedId);
        if (patchedEl?.primarySyncId) {
          const detached = withPatch.map((e) =>
            e.id === selectedId ? { ...e, primarySyncId: undefined } : e,
          );
          return this.applyLayoutTransitionsForContainers(
            elements,
            detached,
            layoutTransitionContainerIds,
          );
        }

        const synced = this.syncElementPatchToPrimary(selectedId, effectivePatch, withPatch);
        if (layoutTransitionContainerIds.length === 0) {
          return synced;
        }

        const syncedContainerIds = synced
          .filter((element) => element.primarySyncId === selectedId)
          .map((element) => element.id);

        return this.applyLayoutTransitionsForContainers(elements, synced, [
          ...layoutTransitionContainerIds,
          ...syncedContainerIds,
        ]);
      });
    };

    if (this.isPropertyNumberGestureActive) {
      applyPatch();
      return;
    }

    this.runWithHistory(() => {
      applyPatch();
    });
  }

  onPropertyNumberGestureStarted(): void {
    if (this.isPropertyNumberGestureActive) {
      return;
    }

    this.isPropertyNumberGestureActive = true;
    this.beginGestureHistory();
  }

  onPropertyNumberGestureCommitted(): void {
    if (!this.isPropertyNumberGestureActive) {
      return;
    }

    this.isPropertyNumberGestureActive = false;
    this.history.commitGestureHistory(() => this.createHistorySnapshot());
  }

  onLayerSelected(event: { pageId: string; id: string; additive: boolean }): void {
    const shouldPreserveAllPagesView = this.page.layersFocusedPageId() === null;

    if (event.pageId !== this.currentPageId()) {
      this.currentPageId.set(event.pageId);
    }

    if (!shouldPreserveAllPagesView) {
      this.page.layersFocusedPageId.set(event.pageId);
    }

    this.page.clearSelectedPageLayer();
    if (event.additive) {
      this.toggleElementSelection(event.id);
    } else {
      this.selectOnlyElement(event.id);
    }
    this.currentTool.set('select');
  }

  onLayerNameChanged(change: { pageId: string; id: string; name: string }): void {
    this.runWithHistory(() => {
      this.updatePageElements(change.pageId, (elements) => {
        const updated = elements.map((element) =>
          element.id === change.id ? { ...element, name: change.name } : element,
        );
        const updatedEl = updated.find((e) => e.id === change.id);
        if (updatedEl?.primarySyncId) {
          return updated.map((e) => (e.id === change.id ? { ...e, primarySyncId: undefined } : e));
        }
        return this.syncElementPatchToPrimary(change.id, { name: change.name }, updated);
      });
    });
  }

  onLayerVisibilityToggled(change: { pageId: string; id: string }): void {
    this.runWithHistory(() => {
      this.updatePageElements(change.pageId, (elements) => {
        const el = elements.find((e) => e.id === change.id);
        const newVisible = el?.visible === false;
        const updated = elements.map((element) =>
          element.id === change.id ? { ...element, visible: element.visible === false } : element,
        );
        if (el?.primarySyncId) {
          return updated.map((e) => (e.id === change.id ? { ...e, primarySyncId: undefined } : e));
        }
        return this.syncElementPatchToPrimary(change.id, { visible: newVisible }, updated);
      });
    });
  }

  onLayerMoved(change: {
    pageId: string;
    draggedId: string;
    targetId: string | null;
    position: 'before' | 'after' | 'inside';
  }): void {
    this.runWithHistory(() => {
      this.updatePageElements(change.pageId, (elements) => {
        const dragged = this.el.findElementById(change.draggedId, elements);
        const draggedBounds = dragged
          ? (this.getLiveElementCanvasBounds(dragged) ?? this.getFlowAwareBounds(dragged, elements))
          : null;
        const reordered = this.el.reorderLayerElements(
          elements,
          change.draggedId,
          change.targetId,
          change.position,
        );

        if (!draggedBounds) {
          return reordered;
        }

        return this.normalizeDraggedElementAfterLayerMove(
          elements,
          reordered,
          change.draggedId,
          draggedBounds,
        );
      });
    });
  }

  onFrameTemplateSelected(template: FrameTemplateSelection): void {
    this.viewport.frameTemplate.set({
      width: template.width,
      height: template.height,
    });

    const centerPoint = this.viewport.getViewportCenterCanvasPoint(this.getCanvasElement());
    const pageOffset = this.getActivePageOffset();
    const frame = this.el.createFrameAtCenter(
      {
        x: centerPoint.x - pageOffset.x,
        y: centerPoint.y - pageOffset.y,
      },
      template.width,
      template.height,
      template.name,
      this.elements(),
    );

    this.runWithHistory(() => {
      this.updateCurrentPageElements((elements) => [...elements, frame]);
      this.selectOnlyElement(frame.id);
      this.currentTool.set('select');
    });

    const bounds = this.el.getAbsoluteBounds(frame, [...this.elements()], this.currentPage());
    this.viewport.focusElement(frame, bounds, this.getCanvasElement());
  }

  setFramework(framework: SupportedFramework): void {
    this.gen.setFramework(framework);
  }

  // ── Context Menu ──────────────────────────────────────────

  onCanvasContextMenu(event: MouseEvent): void {
    event.preventDefault();
    this.contextMenu.open(event.clientX, event.clientY, this.buildContextMenuCallbacks());
  }

  onElementContextMenu(event: MouseEvent, id: string): void {
    event.preventDefault();
    event.stopPropagation();
    this.page.clearSelectedPageLayer();
    if (!this.isElementSelected(id)) {
      this.selectOnlyElement(id);
    } else {
      this.selectedElementId.set(id);
    }
    this.contextMenu.open(event.clientX, event.clientY, this.buildContextMenuCallbacks());
  }

  onLayerContextMenuRequested(event: { pageId: string; id: string; x: number; y: number }): void {
    const shouldPreserveAllPagesView = this.page.layersFocusedPageId() === null;

    if (event.pageId !== this.currentPageId()) {
      this.currentPageId.set(event.pageId);
    }

    if (!shouldPreserveAllPagesView) {
      this.page.layersFocusedPageId.set(event.pageId);
    }

    this.page.clearSelectedPageLayer();
    if (!this.isElementSelected(event.id)) {
      this.selectOnlyElement(event.id);
    } else {
      this.selectedElementId.set(event.id);
    }
    this.contextMenu.open(event.x, event.y, this.buildContextMenuCallbacks());
  }

  closeContextMenu(): void {
    this.contextMenu.close();
  }

  // ── Global Pointer Events ─────────────────────────────────

  @HostListener('window:pointermove', ['$event'])
  onPointerMove(event: MouseEvent): void {
    const canvas = this.getCanvasElement();
    if (canvas) {
      const rect = canvas.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      canvas.style.setProperty('--mx', `${x}px`);
      canvas.style.setProperty('--my', `${y}px`);
    }
    if (this.isDraggingPage) {
      const pointer = this.viewport.getCanvasPoint(event, this.getCanvasElement());
      if (!pointer) {
        return;
      }

      const deltaX = pointer.x - this.pageDragState.pointerX;
      const deltaY = pointer.y - this.pageDragState.pointerY;
      if (Math.abs(deltaX) > 1 || Math.abs(deltaY) > 1) {
        this.hasMovedPageDuringDrag = true;
      }
      this.pages.update((pages) =>
        pages.map((page) =>
          page.id === this.pageDragState.pageId
            ? {
                ...page,
                canvasX: roundToTwoDecimals(this.pageDragState.startX + deltaX),
                canvasY: roundToTwoDecimals(this.pageDragState.startY + deltaY),
              }
            : page,
        ),
      );
      return;
    }

    if (this.rectangleDrawState) {
      this.updateRectangleDrawPreviewFromEvent(event);
      return;
    }

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

    const pointer = this.getActivePageCanvasPoint(event);
    if (!pointer) {
      return;
    }

    const elements = this.elements();
    const dragged = this.el.findElementById(selectedId, elements);
    if (!dragged) {
      return;
    }

    const isGroupDrag = this.dragSelectionIds.length > 1;

    let absoluteX = pointer.x - this.dragOffset.x;
    let absoluteY = pointer.y - this.dragOffset.y;
    const dragDistance = Math.hypot(
      absoluteX - this.dragStartAbsolute.x,
      absoluteY - this.dragStartAbsolute.y,
    );

    if (!this.hasMovedElementDuringDrag) {
      if (dragDistance < ELEMENT_DRAG_START_THRESHOLD) {
        return;
      }
      this.hasMovedElementDuringDrag = true;
    }

    if (event.shiftKey) {
      const dx = Math.abs(absoluteX - this.dragStartAbsolute.x);
      const dy = Math.abs(absoluteY - this.dragStartAbsolute.y);
      if (dx >= dy) {
        absoluteY = this.dragStartAbsolute.y;
      } else {
        absoluteX = this.dragStartAbsolute.x;
      }
    }

    if (isGroupDrag) {
      this.snapLines.set([]);

      const deltaX = absoluteX - this.dragStartAbsolute.x;
      const deltaY = absoluteY - this.dragStartAbsolute.y;

      this.updateCurrentPageElements((elements) =>
        elements.map((element) => {
          if (!this.dragSelectionIds.includes(element.id)) {
            return element;
          }

          const startBounds = this.dragSelectionStartBounds.get(element.id);
          if (!startBounds) {
            return element;
          }

          const nextAbsoluteX = startBounds.x + deltaX;
          const nextAbsoluteY = startBounds.y + deltaY;
          const parent = this.el.findElementById(element.parentId ?? null, elements);

          if (!parent) {
            return {
              ...element,
              x: roundToTwoDecimals(nextAbsoluteX),
              y: roundToTwoDecimals(nextAbsoluteY),
            };
          }

          const parentBounds = this.el.getAbsoluteBounds(parent, elements, this.currentPage());
          return {
            ...element,
            x: clamp(nextAbsoluteX - parentBounds.x, 0, parent.width - element.width),
            y: clamp(nextAbsoluteY - parentBounds.y, 0, parent.height - element.height),
          };
        }),
      );
      return;
    }

    // ── Flow child drag (reorder within layout container) ──
    if (this.draggingFlowChildId()) {
      this.handleFlowChildDragMove(dragged, absoluteX, absoluteY, elements);
      return;
    }

    const { xCandidates, yCandidates } = buildSnapCandidates(selectedId, elements, (el, els) =>
      this.el.getAbsoluteBounds(el, els, this.currentPage()),
    );
    const pageWidth = this.page.currentViewportWidth();
    const pageHeight = this.page.currentViewportHeight();
    xCandidates.push(0, pageWidth / 2, pageWidth);
    yCandidates.push(0, pageHeight / 2, pageHeight);
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
    const isRootFrameDrag = dragged.type === 'frame' && !dragged.parentId;
    if (isRootFrameDrag) {
      absoluteY = this.dragStartAbsolute.y;
      this.snapLines.set(snap.lines.filter((line) => line.type === 'vertical'));

      this.updateCurrentPageElements((elements) => {
        if (this.getRootFrameCount(elements) <= 1) {
          return elements;
        }

        return this.reflowRootFrames(elements, selectedId, absoluteX);
      });
      return;
    } else {
      this.snapLines.set(snap.lines);
    }

    this.updateCurrentPageElements((elements) => {
      const mapped = elements.map((element) => {
        if (element.id !== selectedId) {
          return element;
        }

        if (element.type === 'frame') {
          if (isRootFrameDrag && !element.parentId) {
            return {
              ...element,
              x: roundToTwoDecimals(absoluteX),
              y: roundToTwoDecimals(this.dragStartAbsolute.y),
            };
          }

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

        const parentBounds = this.el.getAbsoluteBounds(parent, elements, this.currentPage());
        return {
          ...element,
          x: clamp(absoluteX - parentBounds.x, 0, parent.width - element.width),
          y: clamp(absoluteY - parentBounds.y, 0, parent.height - element.height),
        };
      });
      const movedEl = mapped.find((e) => e.id === selectedId) ?? null;
      // Don't propagate live drag from a synced copy — it will detach on pointerup
      if (movedEl?.primarySyncId) {
        return mapped;
      }
      return this.syncElementMoveToPrimary(movedEl, mapped);
    });
  }

  @HostListener('window:click', ['$event'])
  onWindowClick(event: MouseEvent): void {
    const target = event.target as HTMLElement | null;
    if (!target) {
      return;
    }

    const viewportControl = target.closest('.canvas-viewport-control');
    if (!viewportControl) {
      this.page.closeViewportMenu();
    }

    const deviceControl = target.closest('.page-device-add');
    if (!deviceControl) {
      this.page.closeDeviceFrameMenu();
    }
  }

  @HostListener('window:pointerup', ['$event'])
  onPointerUp(event: MouseEvent): void {
    if (this.rectangleDrawState) {
      this.updateRectangleDrawPreviewFromEvent(event);
      this.commitRectangleDraw();
      this.clearRectangleDraw();
      this.deferRectangleDrawClickSuppressionReset();
      return;
    }

    const selectedOnDrop = this.selectedElement();
    const prevParentId = selectedOnDrop?.parentId ?? null;
    const isGroupDrag = this.dragSelectionIds.length > 1;
    const shouldCommitGestureHistory =
      this.isDragging ||
      this.isResizing ||
      this.isRotating ||
      this.isAdjustingCornerRadius ||
      this.isDraggingPage;

    if (this.isDragging && this.hasMovedElementDuringDrag) {
      // ── Flow child drop (reorder or detach) ──
      if (this.draggingFlowChildId()) {
        this.commitFlowChildDrop();
      } else if (!isGroupDrag) {
        this.autoGroupOnDrop();
        if (selectedOnDrop?.type === 'frame' && !selectedOnDrop.parentId) {
          this.alignRootFramesOnDrop();
        }
        if (selectedOnDrop) {
          this.updateCurrentPageElements((elements) =>
            this.breakSyncOnParentChange(selectedOnDrop.id, prevParentId, elements),
          );
        }
      }
    }

    if (
      (this.isResizing || (this.isDragging && this.hasMovedElementDuringDrag)) &&
      selectedOnDrop &&
      !isGroupDrag
    ) {
      this.updateCurrentPageElements((elements) => {
        const freshEl = elements.find((e) => e.id === selectedOnDrop.id) ?? null;
        if (freshEl?.primarySyncId) {
          return elements.map((e) =>
            e.id === freshEl.id ? { ...e, primarySyncId: undefined } : e,
          );
        }
        if (freshEl?.type === 'frame' && !freshEl.parentId) {
          return this.syncPrimaryFrameResize(freshEl, elements);
        }
        return this.syncElementMoveToPrimary(freshEl, elements);
      });
    }

    if (this.isDraggingPage && this.hasMovedPageDuringDrag) {
      this.suppressNextPageShellClick = true;
    }

    if (this.viewport.isPanning() && this.viewport.panMoved) {
      this.suppressNextCanvasClick = true;
    }

    this.viewport.endPan();
    this.isDragging = false;
    this.isResizing = false;
    this.isRotating = false;
    this.isAdjustingCornerRadius = false;
    this.isDraggingPage = false;
    this.hasMovedElementDuringDrag = false;
    this.hasMovedPageDuringDrag = false;
    this.isFlowDragInsideContainer = false;
    this.resizeSubtreeSnapshot = new Map();
    this.snapLines.set([]);
    this.flowDragPlaceholder.set(null);
    this.draggingFlowChildId.set(null);
    this.layoutDropTarget.set(null);
    this.dragSelectionIds = [];
    this.dragSelectionStartBounds = new Map();

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
    this.viewport.zoomIn(this.getCanvasElement());
  }

  zoomOut(): void {
    this.viewport.zoomOut(this.getCanvasElement());
  }

  resetZoom(): void {
    this.viewport.resetZoom(this.getCanvasElement());
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

  usesIndependentStrokeSurface(element: CanvasElement): boolean {
    return (
      this.isContainerElement(element) &&
      !this.isLayoutContainer(element) &&
      getStrokeWidth(element) > 0
    );
  }

  getRenderedBorderStyle(element: CanvasElement): string | null {
    return this.usesIndependentStrokeSurface(element) ? null : this.getElementBorderStyle(element);
  }

  getElementSurfaceBorderStyle(element: CanvasElement): string | null {
    return this.usesIndependentStrokeSurface(element) ? this.getElementBorderStyle(element) : null;
  }

  getElementOverflowStyle(element: CanvasElement): string | null {
    if (!this.isContainerElement(element)) {
      return null;
    }

    return this.el.getElementOverflowMode(element) === 'clip' ? 'hidden' : 'visible';
  }

  getElementBorderRadius(element: CanvasElement): string {
    return this.el.getElementBorderRadius(element);
  }

  getElementBoxShadow(element: CanvasElement): string {
    return this.el.getElementBoxShadow(element);
  }

  getElementOutlineStyle(_element: CanvasElement): string {
    return 'none';
  }

  getElementOutlineOffset(_element: CanvasElement): number {
    return 0;
  }

  getSelectionOverlayElement(): CanvasElement | null {
    if (this.selectedElementIds().length !== 1) {
      return null;
    }

    const sel = this.selectedElement();
    if (!sel) return null;
    if (sel.type === 'text' && !sel.text?.length) return null;
    return sel;
  }

  isElementSelected(id: string): boolean {
    return this.selectedElementIds().includes(id);
  }

  hasMultipleElementSelection(): boolean {
    return this.selectedElementIds().length > 1;
  }

  isPartOfMultipleSelection(id: string): boolean {
    return this.hasMultipleElementSelection() && this.isElementSelected(id);
  }

  showSelectionHandles(element: CanvasElement): boolean {
    return element.type !== 'text';
  }

  private clearElementSelection(): void {
    this.editorState.clearElementSelection();
  }

  private selectOnlyElement(id: string): void {
    this.editorState.selectOnlyElement(id);
  }

  private setSelectedElements(ids: string[], primaryId: string | null = null): void {
    const normalizedIds = this.normalizeSelectedElementIds(ids);
    const fallbackPrimaryId =
      normalizedIds.length > 0 ? normalizedIds[normalizedIds.length - 1] : null;
    const nextPrimaryId =
      primaryId && normalizedIds.includes(primaryId) ? primaryId : fallbackPrimaryId;

    this.selectedElementIds.set(normalizedIds);
    this.selectedElementId.set(nextPrimaryId);
  }

  private toggleElementSelection(id: string): void {
    const selectedIds = this.selectedElementIds();
    if (selectedIds.includes(id)) {
      const nextIds = selectedIds.filter((selectedId) => selectedId !== id);
      const nextPrimaryId =
        this.selectedElementId() === id
          ? nextIds.length > 0
            ? nextIds[nextIds.length - 1]
            : null
          : this.selectedElementId();
      this.setSelectedElements(nextIds, nextPrimaryId);
      return;
    }

    this.setSelectedElements([...selectedIds, id], id);
  }

  private normalizeSelectedElementIds(ids: string[]): string[] {
    const availableIds = new Set(this.elements().map((element) => element.id));
    return [...new Set(ids)].filter((id) => availableIds.has(id));
  }

  private getSelectionRootIds(
    ids: string[] = this.selectedElementIds(),
    elements: CanvasElement[] = this.elements(),
  ): string[] {
    const selectedIdSet = new Set(ids);

    return ids.filter((id) => {
      let parentId = elements.find((element) => element.id === id)?.parentId ?? null;
      while (parentId) {
        if (selectedIdSet.has(parentId)) {
          return false;
        }

        parentId = elements.find((element) => element.id === parentId)?.parentId ?? null;
      }

      return true;
    });
  }

  private captureDragSelectionState(anchorId: string): void {
    const elements = this.elements();
    const candidateIds = this.isElementSelected(anchorId) ? this.getSelectionRootIds() : [anchorId];
    const dragIds = this.canUseGroupDrag(candidateIds, elements) ? candidateIds : [anchorId];

    this.dragSelectionIds = dragIds;
    this.dragSelectionStartBounds = new Map(
      dragIds
        .map((id) => {
          const element = this.el.findElementById(id, elements);
          return [
            id,
            element ? this.el.getAbsoluteBounds(element, elements, this.currentPage()) : null,
          ];
        })
        .filter((entry): entry is [string, Bounds] => entry[1] !== null),
    );
  }

  private canUseGroupDrag(ids: string[], elements: CanvasElement[]): boolean {
    if (ids.length <= 1) {
      return false;
    }

    return ids.every((id) => {
      const element = this.el.findElementById(id, elements);
      if (!element) {
        return false;
      }

      const parent = this.el.findElementById(element.parentId ?? null, elements);
      return !(parent && this.isLayoutContainer(parent) && this.isChildInFlow(element));
    });
  }

  getRenderedX(element: CanvasElement): number {
    void this.flowCacheVersion(); // track for overlay reactivity
    const cached = this.flowBoundsDirty ? undefined : this.flowBoundsCache.get(element.id);
    if (cached) return cached.x;
    const layout = this.page.activePageLayout();
    return (
      this.el.getAbsoluteBounds(element, this.elements(), this.currentPage()).x + (layout?.x ?? 0)
    );
  }

  getRenderedY(element: CanvasElement): number {
    void this.flowCacheVersion(); // track for overlay reactivity
    const cached = this.flowBoundsDirty ? undefined : this.flowBoundsCache.get(element.id);
    if (cached) return cached.y;
    const layout = this.page.activePageLayout();
    return (
      this.el.getAbsoluteBounds(element, this.elements(), this.currentPage()).y + (layout?.y ?? 0)
    );
  }

  getRenderedWidth(element: CanvasElement): number {
    return this.el.getRenderedWidth(element, this.elements(), this.currentPage());
  }

  getRenderedHeight(element: CanvasElement): number {
    return this.el.getRenderedHeight(element, this.elements(), this.currentPage());
  }

  getRenderedMinWidthStyle(element: CanvasElement): string | null {
    return this.el.getRenderedMinWidthStyle(element, this.elements(), this.currentPage());
  }

  getRenderedMaxWidthStyle(element: CanvasElement): string | null {
    return this.el.getRenderedMaxWidthStyle(element, this.elements(), this.currentPage());
  }

  getRenderedMinHeightStyle(element: CanvasElement): string | null {
    return this.el.getRenderedMinHeightStyle(element, this.elements(), this.currentPage());
  }

  getRenderedMaxHeightStyle(element: CanvasElement): string | null {
    return this.el.getRenderedMaxHeightStyle(element, this.elements(), this.currentPage());
  }

  getRenderedWidthStyle(element: CanvasElement): string {
    return this.el.getRenderedWidthStyle(element, this.elements(), this.currentPage());
  }

  getRenderedHeightStyle(element: CanvasElement): string {
    return this.el.getRenderedHeightStyle(element, this.elements(), this.currentPage());
  }

  getFrameTitle(element: CanvasElement): string {
    return getFrameTitle(element);
  }

  isRootFrame(element: CanvasElement): boolean {
    return element.type === 'frame' && !element.parentId;
  }

  // ── Layout helpers ────────────────────────────────────────

  isLayoutContainer(element: CanvasElement): boolean {
    return !!element.display && (element.type === 'frame' || element.type === 'rectangle');
  }

  isContainerElement(element: CanvasElement): boolean {
    return this.el.isContainerElement(element);
  }

  /** True if this is a flow child (parent has layout, element not absolute/fixed). */
  isChildInFlow(element: CanvasElement): boolean {
    const pos = element.position;
    return !pos || pos === 'static' || pos === 'relative' || pos === 'sticky';
  }

  /** True if this element has any container ancestor and should render inside that subtree. */
  private hasContainerAncestor(element: CanvasElement, elements: CanvasElement[]): boolean {
    if (!element.parentId) return false;
    const parent = this.el.findElementById(element.parentId, elements);
    if (!parent) return false;
    if (this.isContainerElement(parent)) return true;
    return this.hasContainerAncestor(parent, elements);
  }

  /** Direct children of a container, visible only. */
  getLayoutChildren(element: CanvasElement): CanvasElement[] {
    const draggedId = this.draggingFlowChildId();
    return this.visibleElements().filter(
      (el) =>
        el.parentId === element.id &&
        !(this.hasMovedElementDuringDrag && draggedId === el.id && this.isChildInFlow(el)),
    );
  }

  /** X position for a nested child: no left for flow children, relative x for absolute. */
  getNestedX(element: CanvasElement): number | null {
    if (this.isFlowChildDragging(element)) return element.x;
    return this.isChildInFlow(element) ? null : element.x;
  }

  getNestedY(element: CanvasElement): number | null {
    if (this.isFlowChildDragging(element)) return element.y;
    return this.isChildInFlow(element) ? null : element.y;
  }

  getElementLayoutDisplay(element: CanvasElement): string | null {
    if (!element.display) return null;
    return element.display;
  }

  getElementLayoutFlexDirection(element: CanvasElement): string | null {
    if (element.display !== 'flex') return null;
    return element.flexDirection ?? null;
  }

  getElementLayoutFlexWrap(element: CanvasElement): string | null {
    if (element.display !== 'flex') return null;
    return element.flexWrap ?? null;
  }

  getElementLayoutJustifyContent(element: CanvasElement): string | null {
    if (element.display !== 'flex') return null;
    return element.justifyContent ?? null;
  }

  getElementLayoutAlignItems(element: CanvasElement): string | null {
    if (element.display !== 'flex') return null;
    return element.alignItems ?? null;
  }

  getElementLayoutGap(element: CanvasElement): string | null {
    if (!element.display || element.display === 'block') return null;
    return typeof element.gap === 'number' ? `${element.gap}px` : null;
  }

  getElementLayoutGridTemplateColumns(element: CanvasElement): string | null {
    if (element.display !== 'grid') return null;
    return element.gridTemplateColumns ?? null;
  }

  getElementLayoutGridTemplateRows(element: CanvasElement): string | null {
    if (element.display !== 'grid') return null;
    return element.gridTemplateRows ?? null;
  }

  getElementLayoutPadding(element: CanvasElement): string | null {
    if (!element.padding) return null;
    const p = element.padding;
    return `${p.top}px ${p.right}px ${p.bottom}px ${p.left}px`;
  }

  getNestedPositionStyle(element: CanvasElement): string | null {
    if (this.isFlowChildDragging(element)) return 'absolute';
    if (this.isChildInFlow(element)) {
      return this.isContainerElement(element) ? 'relative' : null;
    }
    return element.position ?? 'absolute';
  }

  isFlowChildDragging(element: CanvasElement): boolean {
    return this.draggingFlowChildId() === element.id && this.hasMovedElementDuringDrag;
  }

  getFlowDragPlaceholder(): { element: CanvasElement; bounds: Bounds } | null {
    const placeholder = this.flowDragPlaceholder();
    if (!placeholder || !this.hasMovedElementDuringDrag) {
      return null;
    }

    const draggedId = this.draggingFlowChildId();
    if (!draggedId || draggedId !== placeholder.elementId) {
      return null;
    }

    const element = this.el.findElementById(placeholder.elementId, this.elements());
    if (!element) {
      return null;
    }

    return {
      element,
      bounds: placeholder.bounds,
    };
  }

  getFlowDragPlaceholderFill(element: CanvasElement): string {
    if (element.type === 'text' || element.type === 'image') {
      return 'rgba(255, 255, 255, 0.08)';
    }

    return element.fill ?? 'rgba(255, 255, 255, 0.08)';
  }

  getFlowDragLayoutPlaceholder(
    containerId: string,
  ): { element: CanvasElement; index: number; bounds: Bounds } | null {
    const placeholder = this.flowDragPlaceholder();
    if (!placeholder || !this.hasMovedElementDuringDrag) {
      return null;
    }

    const draggedId = this.draggingFlowChildId();
    const target = this.layoutDropTarget();
    if (!draggedId || !target || target.containerId !== containerId) {
      return null;
    }

    const element = this.el.findElementById(draggedId, this.elements());
    if (!element || element.parentId !== containerId || !this.isChildInFlow(element)) {
      return null;
    }

    return {
      element,
      index: target.index,
      bounds: placeholder.bounds,
    };
  }

  markFlowBoundsDirty(): void {
    this.flowBoundsDirty = true;
  }

  private updateFlowBoundsCache(): void {
    const sceneEl = this.canvasSceneRef?.nativeElement;
    if (!sceneEl) return;
    const zoom = this.viewport.zoomLevel();
    const sceneRect = sceneEl.getBoundingClientRect();
    const flowEls = sceneEl.querySelectorAll<HTMLElement>('[data-flow-child="true"]');
    const newCache = new Map<string, Bounds>();
    for (const domEl of flowEls) {
      const id = domEl.getAttribute('data-element-id');
      if (!id) continue;
      const rect = domEl.getBoundingClientRect();
      newCache.set(id, {
        x: roundToTwoDecimals((rect.left - sceneRect.left) / zoom),
        y: roundToTwoDecimals((rect.top - sceneRect.top) / zoom),
        width: roundToTwoDecimals(rect.width / zoom),
        height: roundToTwoDecimals(rect.height / zoom),
      });
    }
    this.flowBoundsCache = newCache;
  }

  // ── Flow child drag helpers ───────────────────────────────

  private handleFlowChildDragMove(
    dragged: CanvasElement,
    absoluteX: number,
    absoluteY: number,
    elements: CanvasElement[],
  ): void {
    const parent = this.el.findElementById(dragged.parentId ?? null, elements);
    if (!parent) return;

    const parentBounds =
      this.getLiveElementCanvasBounds(parent) ??
      this.el.getAbsoluteBounds(parent, elements, this.currentPage());
    const layout = this.page.activePageLayout();
    const currentPreview = this.flowDragPlaceholder();
    const previewWidth =
      currentPreview?.elementId === dragged.id ? currentPreview.bounds.width : dragged.width;
    const previewHeight =
      currentPreview?.elementId === dragged.id ? currentPreview.bounds.height : dragged.height;
    this.flowDragPlaceholder.set({
      elementId: dragged.id,
      bounds: {
        x: roundToTwoDecimals(absoluteX + (layout?.x ?? 0)),
        y: roundToTwoDecimals(absoluteY + (layout?.y ?? 0)),
        width: roundToTwoDecimals(previewWidth),
        height: roundToTwoDecimals(previewHeight),
      },
    });

    // Check if element center is still inside the parent container
    const centerX = absoluteX + previewWidth / 2;
    const centerY = absoluteY + previewHeight / 2;
    const insideParent =
      centerX >= parentBounds.x &&
      centerX <= parentBounds.x + parentBounds.width &&
      centerY >= parentBounds.y &&
      centerY <= parentBounds.y + parentBounds.height;

    this.isFlowDragInsideContainer = insideParent;

    if (insideParent) {
      const dropIndex = this.computeLayoutDropIndex(parent, centerX, centerY, elements);
      this.layoutDropTarget.set({ containerId: parent.id, index: dropIndex });
    }

    this.snapLines.set([]);
  }

  private computeLayoutDropIndex(
    container: CanvasElement,
    absoluteX: number,
    absoluteY: number,
    elements: CanvasElement[],
  ): number {
    const isRow =
      container.display === 'flex' &&
      (!container.flexDirection ||
        container.flexDirection === 'row' ||
        container.flexDirection === 'row-reverse');

    const draggedId = this.draggingFlowChildId();
    const siblings = elements.filter(
      (el) => el.parentId === container.id && el.id !== draggedId && this.isChildInFlow(el),
    );

    const layout = this.page.activePageLayout();
    const offsetX = layout?.x ?? 0;
    const offsetY = layout?.y ?? 0;

    for (let i = 0; i < siblings.length; i++) {
      const cached = this.flowBoundsCache.get(siblings[i].id);
      if (!cached) continue;
      const sibAbsX = cached.x - offsetX;
      const sibAbsY = cached.y - offsetY;

      if (isRow) {
        if (absoluteX < sibAbsX + cached.width / 2) return i;
      } else {
        if (absoluteY < sibAbsY + cached.height / 2) return i;
      }
    }

    return siblings.length;
  }

  private getFlowChildIndex(
    containerId: string,
    childId: string,
    elements: CanvasElement[],
  ): number {
    const flowChildren = elements.filter(
      (element) => element.parentId === containerId && this.isChildInFlow(element),
    );
    const index = flowChildren.findIndex((element) => element.id === childId);
    return index < 0 ? flowChildren.length : index;
  }

  private commitFlowChildDrop(): void {
    const draggedId = this.draggingFlowChildId();
    if (!draggedId) return;

    const target = this.layoutDropTarget();
    if (target && this.isFlowDragInsideContainer) {
      this.commitFlowChildReorder(draggedId, target.containerId, target.index);
    } else {
      const dragged = this.el.findElementById(draggedId, this.elements());
      const parent = dragged
        ? this.el.findElementById(dragged.parentId ?? null, this.elements())
        : null;

      if (parent?.type === 'frame') {
        this.detachFlowChild(draggedId);
      } else {
        this.restoreFlowChildToContainer(draggedId);
      }
    }
  }

  private commitFlowChildReorder(draggedId: string, containerId: string, dropIndex: number): void {
    this.updateCurrentPageElements((elements) => {
      const dragged = elements.find((el) => el.id === draggedId);
      if (!dragged) return elements;

      const container = this.el.findElementById(containerId, elements);
      if (!container) return elements;

      const flowSiblings = elements.filter(
        (el) => el.parentId === containerId && el.id !== draggedId && this.isChildInFlow(el),
      );

      const rest = elements.filter((el) => el.id !== draggedId);
      const updatedDragged = {
        ...dragged,
        parentId: container.id,
        x: 0,
        y: 0,
        position: this.el.getDefaultPositionForPlacement(dragged.type, container),
      };

      const insertBeforeId = dropIndex < flowSiblings.length ? flowSiblings[dropIndex].id : null;

      if (insertBeforeId) {
        const idx = rest.findIndex((el) => el.id === insertBeforeId);
        return [...rest.slice(0, idx), updatedDragged, ...rest.slice(idx)];
      }

      // Append after the last child of this container
      let lastChildIdx = -1;
      for (let i = rest.length - 1; i >= 0; i--) {
        if (rest[i].parentId === containerId) {
          lastChildIdx = i;
          break;
        }
      }
      if (lastChildIdx === -1) {
        const containerIdx = rest.findIndex((el) => el.id === containerId);
        return [
          ...rest.slice(0, containerIdx + 1),
          updatedDragged,
          ...rest.slice(containerIdx + 1),
        ];
      }
      return [...rest.slice(0, lastChildIdx + 1), updatedDragged, ...rest.slice(lastChildIdx + 1)];
    });
  }

  private detachFlowChild(draggedId: string): void {
    this.updateCurrentPageElements((elements) => {
      const dragged = elements.find((el) => el.id === draggedId);
      if (!dragged) return elements;

      const preview = this.flowDragPlaceholder();
      const layout = this.page.activePageLayout();
      const absBounds =
        preview && preview.elementId === draggedId
          ? {
              x: roundToTwoDecimals(preview.bounds.x - (layout?.x ?? 0)),
              y: roundToTwoDecimals(preview.bounds.y - (layout?.y ?? 0)),
              width: preview.bounds.width,
              height: preview.bounds.height,
            }
          : this.el.getAbsoluteBounds(dragged, elements, this.currentPage());
      return elements.map((el) =>
        el.id === draggedId
          ? {
              ...el,
              parentId: null,
              x: roundToTwoDecimals(absBounds.x),
              y: roundToTwoDecimals(absBounds.y),
              width: roundToTwoDecimals(absBounds.width),
              height: roundToTwoDecimals(absBounds.height),
              position: this.el.getDefaultPositionForPlacement(el.type, null),
            }
          : el,
      );
    });
  }

  private restoreFlowChildToContainer(draggedId: string): void {
    this.updateCurrentPageElements((elements) => {
      const dragged = elements.find((el) => el.id === draggedId);
      if (!dragged) {
        return elements;
      }

      const parent = this.el.findElementById(dragged.parentId ?? null, elements);
      return elements.map((el) =>
        el.id === draggedId
          ? {
              ...el,
              x: 0,
              y: 0,
              position: this.el.getDefaultPositionForPlacement(el.type, parent),
            }
          : el,
      );
    });
  }

  // ── Drop indicator helpers ────────────────────────────────

  getDropIndicatorLeft(): number | null {
    return this.getDropIndicatorBounds()?.x ?? null;
  }

  getDropIndicatorTop(): number | null {
    return this.getDropIndicatorBounds()?.y ?? null;
  }

  getDropIndicatorWidth(): number | null {
    return this.getDropIndicatorBounds()?.width ?? null;
  }

  getDropIndicatorHeight(): number | null {
    return this.getDropIndicatorBounds()?.height ?? null;
  }

  private getDropIndicatorBounds(): Bounds | null {
    const target = this.layoutDropTarget();
    if (!target) return null;

    const elements = this.elements();
    const container = this.el.findElementById(target.containerId, elements);
    if (!container) return null;

    const containerBounds = this.el.getAbsoluteBounds(container, elements, this.currentPage());
    const layout = this.page.activePageLayout();
    const offsetX = layout?.x ?? 0;
    const offsetY = layout?.y ?? 0;

    const isRow =
      container.display === 'flex' &&
      (!container.flexDirection ||
        container.flexDirection === 'row' ||
        container.flexDirection === 'row-reverse');

    const draggedId = this.draggingFlowChildId();
    const siblings = elements.filter(
      (el) => el.parentId === target.containerId && el.id !== draggedId && this.isChildInFlow(el),
    );

    if (isRow) {
      let indicatorX: number;
      if (siblings.length === 0) {
        indicatorX = containerBounds.x + (container.padding?.left ?? 0) + offsetX;
      } else if (target.index >= siblings.length) {
        const last = siblings[siblings.length - 1];
        const cached = this.flowBoundsCache.get(last.id);
        indicatorX = cached
          ? cached.x + cached.width
          : containerBounds.x + containerBounds.width - (container.padding?.right ?? 0) + offsetX;
      } else {
        const sib = siblings[target.index];
        const cached = this.flowBoundsCache.get(sib.id);
        indicatorX = cached
          ? cached.x
          : containerBounds.x + (container.padding?.left ?? 0) + offsetX;
      }
      return {
        x: indicatorX,
        y: containerBounds.y + offsetY,
        width: 2,
        height: containerBounds.height,
      };
    } else {
      let indicatorY: number;
      if (siblings.length === 0) {
        indicatorY = containerBounds.y + (container.padding?.top ?? 0) + offsetY;
      } else if (target.index >= siblings.length) {
        const last = siblings[siblings.length - 1];
        const cached = this.flowBoundsCache.get(last.id);
        indicatorY = cached
          ? cached.y + cached.height
          : containerBounds.y + containerBounds.height - (container.padding?.bottom ?? 0) + offsetY;
      } else {
        const sib = siblings[target.index];
        const cached = this.flowBoundsCache.get(sib.id);
        indicatorY = cached
          ? cached.y
          : containerBounds.y + (container.padding?.top ?? 0) + offsetY;
      }
      return {
        x: containerBounds.x + offsetX,
        y: indicatorY,
        width: containerBounds.width,
        height: 2,
      };
    }
  }

  getFrameTitleFontSize(): number {
    return this.viewport.getScreenInvariantSize(12.5);
  }

  getFrameTitleOffset(): number {
    return this.viewport.getScreenInvariantSize(-24);
  }

  getShellBorderRadius(): number {
    return 14;
  }

  getShellBorderWidth(): number {
    return this.viewport.getScreenInvariantSize(2);
  }

  isFrameTitleHiddenByHeader(element: CanvasElement): boolean {
    const layout = this.page.activePageLayout();
    if (!layout) return false;
    const zoom = this.viewport.zoomLevel();
    // Title is always 24px above the frame top in screen-space (inside scaled canvas-scene)
    const titleScreenRelY = this.getRenderedY(element) * zoom - 24;
    // Header bottom in screen-space (header is fixed-size, not scaled)
    const headerScreenBottom =
      this.pageLayout.getPageShellHeaderScreenTop(layout.pageId, this.page.pageLayouts()) +
      PAGE_SHELL_HEADER_HEIGHT;
    return titleScreenRelY < headerScreenBottom;
  }

  private alignRootFramesOnDrop(): void {
    this.updateCurrentPageElements((elements) => this.reflowRootFrames(elements));

    this.isFrameReorderAnimating.set(true);
    if (this.frameReorderAnimationTimeoutId) {
      clearTimeout(this.frameReorderAnimationTimeoutId);
    }

    this.frameReorderAnimationTimeoutId = setTimeout(() => {
      this.isFrameReorderAnimating.set(false);
      this.frameReorderAnimationTimeoutId = null;
    }, 260);
  }

  // With global box-sizing: border-box, the 2px border is drawn INSIDE the div's width/height.
  // To place ring fully OUTSIDE the element: left/top -= 2, width/height += 4 (2px each side).
  getSelectionLeft(el: CanvasElement): number {
    const bounds = this.getLiveOverlaySceneBounds(el) ?? this.getCachedOverlaySceneBounds(el);
    return roundToTwoDecimals(bounds.x * this.viewport.zoomLevel() - 2);
  }

  getSelectionTop(el: CanvasElement): number {
    const bounds = this.getLiveOverlaySceneBounds(el) ?? this.getCachedOverlaySceneBounds(el);
    return roundToTwoDecimals(bounds.y * this.viewport.zoomLevel() - 2);
  }

  getSelectionWidth(el: CanvasElement): number {
    const bounds = this.getLiveOverlaySceneBounds(el) ?? this.getCachedOverlaySceneBounds(el);
    return roundToTwoDecimals(bounds.width * this.viewport.zoomLevel() + 4);
  }

  getSelectionHeight(el: CanvasElement): number {
    const bounds = this.getLiveOverlaySceneBounds(el) ?? this.getCachedOverlaySceneBounds(el);
    return roundToTwoDecimals(bounds.height * this.viewport.zoomLevel() + 4);
  }

  private getLiveOverlaySceneBounds(element: CanvasElement): Bounds | null {
    void this.flowCacheVersion(); // track for overlay reactivity

    const sceneEl = this.canvasSceneRef?.nativeElement;
    if (!sceneEl) {
      return null;
    }

    const domEl = sceneEl.querySelector<HTMLElement>(`[data-element-id="${element.id}"]`);
    if (!domEl) {
      return null;
    }

    const zoom = this.viewport.zoomLevel();
    const sceneRect = sceneEl.getBoundingClientRect();
    const rect = domEl.getBoundingClientRect();

    return {
      x: roundToTwoDecimals((rect.left - sceneRect.left) / zoom),
      y: roundToTwoDecimals((rect.top - sceneRect.top) / zoom),
      width: roundToTwoDecimals(rect.width / zoom),
      height: roundToTwoDecimals(rect.height / zoom),
    };
  }

  private getCachedOverlaySceneBounds(element: CanvasElement): Bounds {
    void this.flowCacheVersion(); // track for overlay reactivity

    const cached = this.flowBoundsDirty ? undefined : this.flowBoundsCache.get(element.id);
    if (cached) {
      return cached;
    }

    const layout = this.page.activePageLayout();
    const absolute = this.el.getAbsoluteBounds(element, this.elements(), this.currentPage());
    return {
      x: roundToTwoDecimals(absolute.x + (layout?.x ?? 0)),
      y: roundToTwoDecimals(absolute.y + (layout?.y ?? 0)),
      width: absolute.width,
      height: absolute.height,
    };
  }

  private getLiveElementCanvasBounds(element: CanvasElement): Bounds | null {
    const sceneBounds = this.getLiveOverlaySceneBounds(element);
    if (!sceneBounds) {
      return null;
    }

    const layout = this.page.activePageLayout();
    return {
      x: roundToTwoDecimals(sceneBounds.x - (layout?.x ?? 0)),
      y: roundToTwoDecimals(sceneBounds.y - (layout?.y ?? 0)),
      width: sceneBounds.width,
      height: sceneBounds.height,
    };
  }

  getOverlayCornerRadiusInset(el: CanvasElement): number {
    const radius = Number.isFinite(el.cornerRadius ?? Number.NaN)
      ? (el.cornerRadius as number)
      : el.type === 'image'
        ? 6
        : 0;
    const zoom = this.viewport.zoomLevel();
    const liveBounds = this.getLiveOverlaySceneBounds(el);
    const renderedWidth = liveBounds?.width ?? el.width;
    const renderedHeight = liveBounds?.height ?? el.height;
    const handleRadius = 6; // half of 12px handle size
    // Compute screen-space inset directly: handle center should be at (radius * zoom) px
    // from the element corner in screen space, so CSS top/right = radius*zoom - handleRadius.
    // minScreenInset keeps the handle visibly inside the corner even at radius=0.
    const minScreenInset = 8;
    const maxScreenInset = Math.max(
      0,
      (Math.min(renderedWidth, renderedHeight) * zoom) / 2 - handleRadius,
    );
    return roundToTwoDecimals(clamp(radius * zoom - handleRadius, minScreenInset, maxScreenInset));
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
    return getTextFontFamily(element);
  }

  getTextFontWeight(element: CanvasElement): number {
    return getTextFontWeight(element);
  }

  getTextFontStyle(element: CanvasElement): string {
    return getTextFontStyle(element);
  }

  getTextFontSize(element: CanvasElement): string {
    return getTextFontSize(element);
  }

  getTextLineHeight(element: CanvasElement): string {
    return getTextLineHeight(element);
  }

  getTextLetterSpacing(element: CanvasElement): string {
    return getTextLetterSpacing(element);
  }

  getTextAlignValue(element: CanvasElement): string {
    return getTextAlignValue(element);
  }

  trackByElementId(_: number, element: CanvasElement): string {
    return element.id;
  }

  supportsCornerRadius(element: CanvasElement): boolean {
    return this.el.supportsCornerRadius(element);
  }

  private getRootFrameCount(elements: CanvasElement[]): number {
    return elements.filter((element) => this.isRootFrame(element)).length;
  }

  private reflowRootFrames(
    elements: CanvasElement[],
    draggedId?: string,
    draggedX?: number,
  ): CanvasElement[] {
    const rootFrames = elements.filter((element) => this.isRootFrame(element));
    if (rootFrames.length <= 1) {
      return elements;
    }

    const ordered = [...rootFrames].sort((a, b) => {
      const ax = a.id === draggedId && typeof draggedX === 'number' ? draggedX : a.x;
      const bx = b.id === draggedId && typeof draggedX === 'number' ? draggedX : b.x;
      return ax - bx;
    });

    const startX = Math.min(...rootFrames.map((frame) => frame.x));
    const baselineY = rootFrames[0]?.y ?? 0;
    let cursorX = startX;
    const nextById = new Map<string, { x: number; y: number }>();

    for (const frame of ordered) {
      nextById.set(frame.id, {
        x: roundToTwoDecimals(cursorX),
        y: roundToTwoDecimals(baselineY),
      });
      cursorX += frame.width + ROOT_FRAME_INSERT_GAP;
    }

    return elements.map((element) => {
      const next = nextById.get(element.id);
      if (!next) {
        return element;
      }

      return {
        ...element,
        x: next.x,
        y: next.y,
      };
    });
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

  getElementTransformOrigin(element: CanvasElement): string | null {
    return this.el.getElementTransformOrigin(element);
  }

  getElementBackfaceVisibility(element: CanvasElement): string | null {
    return this.el.getElementBackfaceVisibility(element);
  }

  getElementTransformStyle(element: CanvasElement): string | null {
    return this.el.getElementTransformStyle(element);
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
    this.discardEmptyTextElement(this.editingTextElementId());
    this.editingTextElementId.set(null);
  }

  // ── Code Generation ───────────────────────────────────────

  validateIR(): void {
    this.apiError.set(null);
    this.gen.validate(this.irPages());
  }

  generateCode(): void {
    this.apiError.set(null);
    this.gen.generate(this.irPages());
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
        const pages = response.pages;
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

    const document = buildCanvasProjectDocument(this.pages(), this.projectId, this.currentPageId());
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

  private persistThumbnailIfDue(): void {
    const thumbnail = generateThumbnail(this.currentPage());
    if (!thumbnail) {
      return;
    }

    this.canvasPersistenceService
      .saveProjectThumbnail(this.projectIdAsNumber, thumbnail)
      .subscribe();
  }

  // ── Private: Gesture Handling ─────────────────────────────

  private handleRotatePointerMove(event: MouseEvent): void {
    const start = this.rotateStart;
    if (!start.elementId) {
      return;
    }

    const pointer = this.getActivePageCanvasPoint(event);
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

    const pointer = this.getActivePageCanvasPoint(event);
    if (!pointer) {
      return;
    }

    this.updateCurrentPageElements((elements) => {
      const resizedElements = elements.map((element) => {
        if (element.id !== start.elementId) {
          return element;
        }

        const parent = this.el.findElementById(element.parentId ?? null, elements);
        const parentBounds = parent
          ? this.el.getAbsoluteBounds(parent, elements, this.currentPage())
          : null;
        const bounds = calculateResizedBounds(
          this.resizeStart,
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

        mutateNormalizeElement(nextElement, elements);
        return nextElement;
      });

      let resizedTarget = resizedElements.find((element) => element.id === start.elementId) ?? null;

      // Snap the bottom/north edge to sibling root-frame edges when resizing a root frame
      let snappedElements = resizedElements;
      if (resizedTarget && this.isRootFrame(resizedTarget) && start.handle.includes('s')) {
        const candidates: number[] = elements
          .filter((el) => el.type === 'frame' && !el.parentId && el.id !== start.elementId)
          .flatMap((el) => [el.y + el.height, el.y]);
        const currentBottom = resizedTarget.y + resizedTarget.height;
        let bestDelta = SNAP_THRESHOLD;
        let snappedBottom: number | null = null;
        for (const c of candidates) {
          const delta = Math.abs(c - currentBottom);
          if (delta < bestDelta) {
            bestDelta = delta;
            snappedBottom = c;
          }
        }
        if (snappedBottom !== null) {
          const snappedHeight = roundToTwoDecimals(Math.max(24, snappedBottom - resizedTarget.y));
          snappedElements = resizedElements.map((e) =>
            e.id === start.elementId ? { ...e, height: snappedHeight } : e,
          );
          this.snapLines.set([{ type: 'horizontal', position: snappedBottom }]);
        } else {
          this.snapLines.set([]);
        }
        resizedTarget = snappedElements.find((e) => e.id === start.elementId) ?? null;
      }

      let result: CanvasElement[];
      if (
        !resizedTarget ||
        !this.isRootFrame(resizedTarget) ||
        this.getRootFrameCount(snappedElements) <= 1
      ) {
        result = snappedElements;
      } else {
        result = this.reflowRootFrames(snappedElements, resizedTarget.id, resizedTarget.x);
      }

      if (resizedTarget) {
        result = this.applyResponsiveResizeToDescendants(result, resizedTarget.id);
      }

      const freshResized = result.find((e) => e.id === start.elementId) ?? null;
      // Don't propagate live resize from a synced copy — it will detach on pointerup
      if (freshResized?.primarySyncId) {
        return result;
      }
      // Sync primary frame size → sibling frames
      if (freshResized?.type === 'frame' && !freshResized.parentId) {
        return this.syncPrimaryFrameResize(freshResized, result);
      }
      return this.syncElementMoveToPrimary(freshResized, result);
    });
  }

  private handleCornerRadiusPointerMove(event: MouseEvent): void {
    const start = this.cornerRadiusStart;
    if (!start.elementId) {
      return;
    }

    const pointer = this.getActivePageCanvasPoint(event);
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

  private captureResizeSubtreeSnapshot(elementId: string, elements: CanvasElement[]): void {
    const subtreeIds = new Set(collectSubtreeIds(elements, elementId));
    this.resizeSubtreeSnapshot = new Map(
      elements
        .filter((element) => subtreeIds.has(element.id))
        .map((element) => [element.id, structuredClone(element)]),
    );
  }

  private applyResponsiveResizeToDescendants(
    elements: CanvasElement[],
    resizedElementId: string,
  ): CanvasElement[] {
    const sourceRoot = this.resizeSubtreeSnapshot.get(resizedElementId);
    const resizedRoot = this.el.findElementById(resizedElementId, elements);
    if (
      !sourceRoot ||
      !resizedRoot ||
      !this.isContainerElement(resizedRoot) ||
      this.isLayoutContainer(resizedRoot) ||
      this.resizeSubtreeSnapshot.size <= 1
    ) {
      return elements;
    }

    const sourceElements = Array.from(this.resizeSubtreeSnapshot.values());
    const subtreeIds = new Set(this.resizeSubtreeSnapshot.keys());
    const nextElements = elements.map((element) =>
      subtreeIds.has(element.id) ? { ...element } : element,
    );
    const nextById = new Map(nextElements.map((element) => [element.id, element]));

    const descendants = sourceElements
      .filter((element) => element.id !== resizedElementId)
      .sort(
        (left, right) =>
          this.getElementNestingDepth(left, sourceElements) -
          this.getElementNestingDepth(right, sourceElements),
      );

    for (const sourceElement of descendants) {
      const nextElement = nextById.get(sourceElement.id);
      const sourceParent = this.resizeSubtreeSnapshot.get(sourceElement.parentId ?? '');
      const nextParent = nextById.get(sourceElement.parentId ?? '');
      if (!nextElement || !sourceParent || !nextParent) {
        continue;
      }

      const scaleX = sourceParent.width > 0 ? nextParent.width / sourceParent.width : 1;
      const scaleY = sourceParent.height > 0 ? nextParent.height / sourceParent.height : 1;
      const shouldScalePosition =
        !this.isLayoutContainer(nextParent) || !this.isChildInFlow(sourceElement);
      const textScale = Math.min(Math.abs(scaleX), Math.abs(scaleY));

      const updatedElement: CanvasElement = {
        ...nextElement,
        x: shouldScalePosition ? roundToTwoDecimals(sourceElement.x * scaleX) : nextElement.x,
        y: shouldScalePosition ? roundToTwoDecimals(sourceElement.y * scaleY) : nextElement.y,
        width: roundToTwoDecimals(sourceElement.width * scaleX),
        height: roundToTwoDecimals(sourceElement.height * scaleY),
      };

      if (updatedElement.type === 'text' && typeof sourceElement.fontSize === 'number') {
        updatedElement.fontSize = roundToTwoDecimals(sourceElement.fontSize * textScale);

        if (
          typeof sourceElement.letterSpacing === 'number' &&
          sourceElement.letterSpacingUnit !== 'em'
        ) {
          updatedElement.letterSpacing = roundToTwoDecimals(
            sourceElement.letterSpacing * textScale,
          );
        }

        if (typeof sourceElement.lineHeight === 'number' && sourceElement.lineHeightUnit === 'px') {
          updatedElement.lineHeight = roundToTwoDecimals(sourceElement.lineHeight * textScale);
        }
      }

      mutateNormalizeElement(updatedElement, nextElements);
      nextById.set(updatedElement.id, updatedElement);

      const index = nextElements.findIndex((element) => element.id === updatedElement.id);
      if (index >= 0) {
        nextElements[index] = updatedElement;
      }
    }

    return nextElements;
  }

  // ── Private: Helpers ──────────────────────────────────────

  private updateCurrentPageElements(updater: (elements: CanvasElement[]) => CanvasElement[]): void {
    this.editorState.updateCurrentPageElements(updater);
  }

  private updatePageElements(
    pageId: string,
    updater: (elements: CanvasElement[]) => CanvasElement[],
  ): void {
    this.editorState.updatePageElements(pageId, updater);
  }

  private updateCurrentPage(updater: (page: CanvasPageModel) => CanvasPageModel): void {
    this.editorState.updateCurrentPage(updater);
  }

  private getActivePageOffset(): Point {
    const layout = this.page.activePageLayout();
    if (!layout) {
      return { x: 0, y: 0 };
    }
    return { x: layout.x, y: layout.y };
  }

  private getActivePageCanvasPoint(event: MouseEvent): Point | null {
    const pointer = this.viewport.getCanvasPoint(event, this.getCanvasElement());
    if (!pointer) {
      return null;
    }

    const offset = this.getActivePageOffset();
    return {
      x: roundToTwoDecimals(pointer.x - offset.x),
      y: roundToTwoDecimals(pointer.y - offset.y),
    };
  }

  private startRectangleDraw(event: MouseEvent, suppressPageShellClick = false): boolean {
    if (
      this.currentTool() !== 'rectangle' ||
      event.button !== 0 ||
      this.viewport.isSpacePressed()
    ) {
      return false;
    }

    const pointer = this.getActivePageCanvasPoint(event);
    if (!pointer) {
      return false;
    }

    const { container, containerBounds } = this.resolveInsertionContext(pointer);

    event.preventDefault();
    event.stopPropagation();
    this.suppressNextCanvasClick = true;
    if (suppressPageShellClick) {
      this.suppressNextPageShellClick = true;
    }

    if (container && containerBounds && !this.isPointInsideBounds(pointer, containerBounds)) {
      this.apiError.set('Click inside the selected container to place the element.');
      return true;
    }

    this.commitActiveTextEditor();
    this.apiError.set(null);
    this.page.clearSelectedPageLayer();
    this.page.layersFocusedPageId.set(this.currentPageId());
    this.selectedElementId.set(null);

    this.rectangleDrawState = {
      startPoint: pointer,
      currentPoint: pointer,
      containerId: container?.id ?? null,
    };
    this.rectangleDrawPreview.set({
      x: pointer.x,
      y: pointer.y,
      width: 0,
      height: 0,
    });
    return true;
  }

  private updateRectangleDrawPreviewFromEvent(event: MouseEvent): void {
    const state = this.rectangleDrawState;
    if (!state) {
      return;
    }

    const pointer = this.getActivePageCanvasPoint(event);
    if (!pointer) {
      return;
    }

    const container = this.el.findElementById(state.containerId, this.elements());
    const containerBounds = container
      ? this.el.getAbsoluteBounds(container, this.elements(), this.currentPage())
      : null;
    const clampedPoint = containerBounds
      ? {
          x: clamp(pointer.x, containerBounds.x, containerBounds.x + containerBounds.width),
          y: clamp(pointer.y, containerBounds.y, containerBounds.y + containerBounds.height),
        }
      : pointer;

    this.rectangleDrawState = {
      ...state,
      currentPoint: clampedPoint,
    };
    this.rectangleDrawPreview.set(this.buildRectangleDrawBounds(state.startPoint, clampedPoint));
  }

  private commitRectangleDraw(): void {
    const state = this.rectangleDrawState;
    if (!state) {
      return;
    }

    const container = this.el.findElementById(state.containerId, this.elements());
    const containerBounds = container
      ? this.el.getAbsoluteBounds(container, this.elements(), this.currentPage())
      : null;
    const bounds = this.buildRectangleDrawBounds(state.startPoint, state.currentPoint);
    const distance = Math.hypot(
      state.currentPoint.x - state.startPoint.x,
      state.currentPoint.y - state.startPoint.y,
    );

    if (distance < ELEMENT_DRAG_START_THRESHOLD) {
      this.createElementAtCanvasPoint('rectangle', state.startPoint, container, containerBounds);
      return;
    }

    const result = this.el.createRectangleFromBounds(
      bounds,
      this.elements(),
      container,
      containerBounds,
    );
    this.commitElementCreationResult(result);
  }

  private buildRectangleDrawBounds(startPoint: Point, endPoint: Point): Bounds {
    return {
      x: roundToTwoDecimals(Math.min(startPoint.x, endPoint.x)),
      y: roundToTwoDecimals(Math.min(startPoint.y, endPoint.y)),
      width: roundToTwoDecimals(Math.abs(endPoint.x - startPoint.x)),
      height: roundToTwoDecimals(Math.abs(endPoint.y - startPoint.y)),
    };
  }

  private clearRectangleDraw(): void {
    this.rectangleDrawState = null;
    this.rectangleDrawPreview.set(null);
  }

  private setFlowDragPlaceholder(element: CanvasElement, cachedBounds: Bounds | null): void {
    if (cachedBounds) {
      this.flowDragPlaceholder.set({
        elementId: element.id,
        bounds: {
          x: cachedBounds.x,
          y: cachedBounds.y,
          width: cachedBounds.width,
          height: cachedBounds.height,
        },
      });
      return;
    }

    const absoluteBounds = this.el.getAbsoluteBounds(element, this.elements(), this.currentPage());
    const layout = this.page.activePageLayout();
    this.flowDragPlaceholder.set({
      elementId: element.id,
      bounds: {
        x: absoluteBounds.x + (layout?.x ?? 0),
        y: absoluteBounds.y + (layout?.y ?? 0),
        width: absoluteBounds.width,
        height: absoluteBounds.height,
      },
    });
  }

  private deferRectangleDrawClickSuppressionReset(): void {
    setTimeout(() => {
      this.suppressNextCanvasClick = false;
      this.suppressNextPageShellClick = false;
    }, 0);
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
    return false;
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

  /** Returns the id of the topmost non-frame element whose bounds contain (x, y)
   *  in active-page coordinates, preferring deeper nested children over parents. */
  private getTopElementIdAtPoint(x: number, y: number): string | null {
    const elements = this.visibleElements();
    let bestId: string | null = null;
    let bestDepth = -1;

    for (let i = elements.length - 1; i >= 0; i--) {
      const el = elements[i];
      if (el.type === 'frame') continue;
      const b = this.getElementHitTestBounds(el);
      if (x >= b.x && x <= b.x + b.width && y >= b.y && y <= b.y + b.height) {
        const depth = this.getElementNestingDepth(el, elements);
        if (depth > bestDepth) {
          bestId = el.id;
          bestDepth = depth;
        }
      }
    }

    return bestId;
  }

  private getElementHitTestBounds(element: CanvasElement): Bounds {
    const cached = this.flowBoundsDirty ? undefined : this.flowBoundsCache.get(element.id);
    if (cached) {
      const layout = this.page.activePageLayout();
      return {
        x: roundToTwoDecimals(cached.x - (layout?.x ?? 0)),
        y: roundToTwoDecimals(cached.y - (layout?.y ?? 0)),
        width: cached.width,
        height: cached.height,
      };
    }

    return this.el.getAbsoluteBounds(element, this.elements(), this.currentPage());
  }

  private didContainerLayoutStateChange(
    previousElement: CanvasElement,
    nextElement: CanvasElement,
  ): boolean {
    return this.isLayoutContainer(previousElement) !== this.isLayoutContainer(nextElement);
  }

  private applyLayoutTransitionsForContainers(
    previousElements: CanvasElement[],
    nextElements: CanvasElement[],
    containerIds: readonly string[],
  ): CanvasElement[] {
    let updatedElements = nextElements;
    const seenContainerIds = new Set<string>();

    for (const containerId of containerIds) {
      if (!containerId || seenContainerIds.has(containerId)) {
        continue;
      }

      seenContainerIds.add(containerId);
      updatedElements = this.applyLayoutTransitionForContainer(
        previousElements,
        updatedElements,
        containerId,
      );
    }

    return updatedElements;
  }

  private applyLayoutTransitionForContainer(
    previousElements: CanvasElement[],
    nextElements: CanvasElement[],
    containerId: string,
  ): CanvasElement[] {
    const previousContainer = previousElements.find((element) => element.id === containerId);
    const nextContainer = nextElements.find((element) => element.id === containerId);
    if (!previousContainer || !nextContainer) {
      return nextElements;
    }

    const hadLayout = this.isLayoutContainer(previousContainer);
    const hasLayout = this.isLayoutContainer(nextContainer);
    if (hadLayout === hasLayout) {
      return nextElements;
    }

    const previousContainerBounds = this.getFlowAwareBounds(previousContainer, previousElements);

    return nextElements.map((element) => {
      if (element.parentId !== containerId) {
        return element;
      }

      if (hasLayout) {
        return {
          ...element,
          x: 0,
          y: 0,
          position: this.el.getDefaultPositionForPlacement(element.type, nextContainer),
        };
      }

      const previousChild =
        previousElements.find((candidate) => candidate.id === element.id) ?? element;
      const childBounds = this.getFlowAwareBounds(previousChild, previousElements);

      return {
        ...element,
        x: roundToTwoDecimals(
          clamp(childBounds.x - previousContainerBounds.x, 0, nextContainer.width - element.width),
        ),
        y: roundToTwoDecimals(
          clamp(
            childBounds.y - previousContainerBounds.y,
            0,
            nextContainer.height - element.height,
          ),
        ),
        position: this.el.getDefaultPositionForPlacement(element.type, nextContainer),
      };
    });
  }

  private getFlowAwareBounds(element: CanvasElement, elements: CanvasElement[]): Bounds {
    const cached = this.flowBoundsDirty ? undefined : this.flowBoundsCache.get(element.id);
    if (cached) {
      const layout = this.page.activePageLayout();
      return {
        x: roundToTwoDecimals(cached.x - (layout?.x ?? 0)),
        y: roundToTwoDecimals(cached.y - (layout?.y ?? 0)),
        width: cached.width,
        height: cached.height,
      };
    }

    return this.el.getAbsoluteBounds(element, elements, this.currentPage());
  }

  private normalizeDraggedElementAfterLayerMove(
    previousElements: CanvasElement[],
    nextElements: CanvasElement[],
    draggedId: string,
    previousBounds: Bounds,
  ): CanvasElement[] {
    const dragged = this.el.findElementById(draggedId, nextElements);
    if (!dragged) {
      return nextElements;
    }

    const nextParent = this.el.findElementById(dragged.parentId ?? null, nextElements);
    const nextPosition = this.el.getDefaultPositionForPlacement(dragged.type, nextParent);

    if (!nextParent) {
      return nextElements.map((element) =>
        element.id === draggedId
          ? {
              ...element,
              x: roundToTwoDecimals(previousBounds.x),
              y: roundToTwoDecimals(previousBounds.y),
              position: nextPosition,
            }
          : element,
      );
    }

    if (this.isLayoutContainer(nextParent)) {
      return nextElements.map((element) =>
        element.id === draggedId
          ? {
              ...element,
              x: 0,
              y: 0,
              position: nextPosition,
            }
          : element,
      );
    }

    const previousParent = this.el.findElementById(nextParent.id, previousElements) ?? nextParent;
    const parentBounds =
      this.getLiveElementCanvasBounds(previousParent) ??
      this.getFlowAwareBounds(previousParent, previousElements);
    const maxX = Math.max(0, nextParent.width - dragged.width);
    const maxY = Math.max(0, nextParent.height - dragged.height);

    return nextElements.map((element) =>
      element.id === draggedId
        ? {
            ...element,
            x: roundToTwoDecimals(clamp(previousBounds.x - parentBounds.x, 0, maxX)),
            y: roundToTwoDecimals(clamp(previousBounds.y - parentBounds.y, 0, maxY)),
            position: nextPosition,
          }
        : element,
    );
  }

  private getElementNestingDepth(element: CanvasElement, elements: CanvasElement[]): number {
    let depth = 0;
    let currentParentId = element.parentId ?? null;

    while (currentParentId) {
      const parent = this.el.findElementById(currentParentId, elements);
      if (!parent) {
        break;
      }

      depth += 1;
      currentParentId = parent.parentId ?? null;
    }

    return depth;
  }

  private resolveInsertionContainer(pointer: Point): CanvasElement | null {
    const elements = this.elements();
    const hoveredContainers = elements.filter((element) => {
      if (
        !this.el.isContainerElement(element) ||
        !this.el.isElementEffectivelyVisible(element.id, elements)
      ) {
        return false;
      }

      const bounds = this.el.getAbsoluteBounds(element, elements, this.currentPage());
      return (
        pointer.x >= bounds.x &&
        pointer.x <= bounds.x + bounds.width &&
        pointer.y >= bounds.y &&
        pointer.y <= bounds.y + bounds.height
      );
    });

    if (hoveredContainers.length > 0) {
      return hoveredContainers.reduce((best, candidate) => {
        const bestArea = best.width * best.height;
        const candidateArea = candidate.width * candidate.height;
        return candidateArea < bestArea ? candidate : best;
      });
    }

    return this.el.getSelectedContainer(this.selectedElement());
  }

  private resolveInsertionContext(pointer: Point): {
    container: CanvasElement | null;
    containerBounds: Bounds | null;
  } {
    const container = this.resolveInsertionContainer(pointer);
    return {
      container,
      containerBounds: container
        ? this.el.getAbsoluteBounds(container, this.elements(), this.currentPage())
        : null,
    };
  }

  private isPointInsideBounds(point: Point, bounds: Bounds): boolean {
    return (
      point.x >= bounds.x &&
      point.x <= bounds.x + bounds.width &&
      point.y >= bounds.y &&
      point.y <= bounds.y + bounds.height
    );
  }

  private commitActiveTextEditor(): void {
    const editingId = this.editingTextElementId();
    if (!editingId) {
      return;
    }

    this.history.commitTextEditHistory(() => this.createHistorySnapshot());
    this.discardEmptyTextElement(editingId);
    this.editingTextElementId.set(null);
  }

  private createElementAtCanvasPoint(
    tool: CanvasElementType,
    pointer: Point,
    targetContainer?: CanvasElement | null,
    containerBounds?: Bounds | null,
  ): CanvasElement | null {
    const resolvedContainer = targetContainer ?? this.resolveInsertionContainer(pointer);
    const resolvedContainerBounds =
      containerBounds ??
      (resolvedContainer
        ? this.el.getAbsoluteBounds(resolvedContainer, this.elements(), this.currentPage())
        : null);

    const result = this.el.createElementAtPoint(
      tool,
      pointer,
      this.elements(),
      resolvedContainer,
      resolvedContainerBounds,
      this.viewport.frameTemplate(),
    );

    return this.commitElementCreationResult(result);
  }

  private commitElementCreationResult(result: {
    element: CanvasElement | null;
    error: string | null;
  }): CanvasElement | null {
    if (result.error) {
      this.apiError.set(result.error);
      return null;
    }

    if (!result.element) {
      return null;
    }

    const newElement = result.element;
    this.runWithHistory(() => {
      this.updateCurrentPageElements((elements) => {
        const synced = this.createSyncedCopies(newElement, elements);
        return [...elements, newElement, ...synced];
      });
      this.selectedElementId.set(newElement.id);
      this.currentTool.set('select');
    });

    if (newElement.type === 'text') {
      this.editingTextElementId.set(newElement.id);
      this.focusInlineTextEditor(newElement.id);
    }

    return newElement;
  }

  /** After a drag, if a free element was dropped inside a container that is larger
   *  than the element, auto-reparent it to that container. */
  private autoGroupOnDrop(): void {
    const id = this.selectedElementId();
    if (!id) return;

    const elements = this.elements();
    const element = this.el.findElementById(id, elements);
    if (!element || element.type === 'frame' || element.parentId) return;

    const elementBounds = this.el.getAbsoluteBounds(element, elements, this.currentPage());
    const centerX = elementBounds.x + elementBounds.width / 2;
    const centerY = elementBounds.y + elementBounds.height / 2;

    // Find all containers (frames or rectangles) whose bounds contain
    // the element's center and that are strictly larger in both dimensions.
    const candidateContainers = elements.filter((el) => {
      if (el.id === id) return false;
      if (!this.el.isContainerElement(el)) return false;
      const fb = this.el.getAbsoluteBounds(el, elements, this.currentPage());
      const centerInside =
        centerX >= fb.x &&
        centerX <= fb.x + fb.width &&
        centerY >= fb.y &&
        centerY <= fb.y + fb.height;
      const containerLarger = el.width > element.width && el.height > element.height;
      return centerInside && containerLarger;
    });

    if (candidateContainers.length === 0) return;

    // Pick the smallest qualifying container (the most specific).
    const target = candidateContainers.reduce((best, current) =>
      current.width * current.height < best.width * best.height ? current : best,
    );

    const fb = this.el.getAbsoluteBounds(target, elements, this.currentPage());
    const isTargetLayout = this.isLayoutContainer(target);
    this.updateCurrentPageElements((els) =>
      els.map((el) =>
        el.id === id
          ? {
              ...el,
              parentId: target.id,
              position: this.el.getDefaultPositionForPlacement(el.type, target),
              x: isTargetLayout
                ? 0
                : clamp(elementBounds.x - fb.x, 0, target.width - element.width),
              y: isTargetLayout
                ? 0
                : clamp(elementBounds.y - fb.y, 0, target.height - element.height),
            }
          : el,
      ),
    );
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
      editor.select();
    }, 0);
  }

  private measureTextSize(element: CanvasElement): { width: number; height: number } {
    const mirror = document.createElement('span');
    mirror.style.cssText = [
      'position:fixed',
      'top:-9999px',
      'left:-9999px',
      'visibility:hidden',
      'white-space:pre',
      'display:inline-block',
      `font-size:${getTextFontSize(element)}`,
      `font-family:${getTextFontFamily(element)}`,
      `font-weight:${getTextFontWeight(element)}`,
      `font-style:${getTextFontStyle(element)}`,
      `line-height:${getTextLineHeight(element)}`,
      `letter-spacing:${getTextLetterSpacing(element)}`,
    ].join(';');
    // Append a non-breaking space after any trailing newlines so each Enter
    // counts as a real line in the span's layout (trailing \n has no height otherwise).
    const textForMeasure = (element.text || ' ').replace(/\n+$/, (m) => m + '\u200b');
    mirror.textContent = textForMeasure;
    document.body.appendChild(mirror);
    const w = mirror.offsetWidth;
    const h = mirror.offsetHeight;
    document.body.removeChild(mirror);
    return { width: Math.max(w, 24), height: Math.max(h, 4) };
  }

  private discardEmptyTextElement(id: string | null): boolean {
    if (!id) {
      return false;
    }

    const element = this.el.findElementById(id, this.elements());
    if (element?.type !== 'text' || element.text?.trim()) {
      return false;
    }

    this.updateCurrentPageElements((elements) => {
      const withoutElement = removeWithChildren(elements, id);
      return withoutElement.filter((el) => el.primarySyncId !== id);
    });

    if (this.selectedElementId() === id) {
      this.selectedElementId.set(null);
    }

    return true;
  }

  private getAutoSizedTextLayoutPatch(
    previousElement: CanvasElement,
    nextElement: CanvasElement,
    patch: Partial<CanvasElement>,
  ): Partial<CanvasElement> | null {
    if (!this.shouldAutoSizeTextFromPatch(previousElement, patch) || !nextElement.text) {
      return null;
    }

    const size = this.measureTextSize(nextElement);
    const centerX = previousElement.x + previousElement.width / 2;

    return {
      x: roundToTwoDecimals(centerX - size.width / 2),
      width: size.width,
      height: size.height,
    };
  }

  private shouldAutoSizeTextFromPatch(
    element: CanvasElement,
    patch: Partial<CanvasElement>,
  ): boolean {
    if (element.type !== 'text') {
      return false;
    }

    return (
      patch.text !== undefined ||
      patch.fontFamily !== undefined ||
      patch.fontWeight !== undefined ||
      patch.fontStyle !== undefined ||
      patch.fontSize !== undefined ||
      patch.fontSizeUnit !== undefined ||
      patch.lineHeight !== undefined ||
      patch.lineHeightUnit !== undefined ||
      patch.letterSpacing !== undefined ||
      patch.letterSpacingUnit !== undefined
    );
  }

  // ── Private: History Shortcuts ────────────────────────────

  private runWithHistory(action: () => void): void {
    this.history.runWithHistory(() => this.createHistorySnapshot(), action);
  }

  private beginGestureHistory(): void {
    this.history.beginGestureHistory(() => this.createHistorySnapshot());
  }

  private createHistorySnapshot(): HistorySnapshot {
    return this.editorState.createHistorySnapshot();
  }

  private applyHistorySnapshot(snapshot: HistorySnapshot): void {
    this.pages.set(structuredClone(snapshot.pages));
    this.currentPageId.set(snapshot.currentPageId);
    this.setSelectedElements(
      snapshot.selectedElementIds ??
        (snapshot.selectedElementId ? [snapshot.selectedElementId] : []),
      snapshot.selectedElementId,
    );
    this.currentTool.set('select');
    this.editingTextElementId.set(null);
  }

  // ── Private: Clipboard ────────────────────────────────────

  private copySelectedElement(): void {
    const selectedIds = this.selectedElementIds();
    if (selectedIds.length === 0) {
      return;
    }
    this.clipboard.copySelection(selectedIds, this.elements(), this.currentPageId());
    this.apiError.set(null);
  }

  private pasteClipboard(): void {
    if (!this.clipboard.hasClipboard || !this.currentPage()) {
      return;
    }

    const selectedContainer = this.el.getSelectedContainer(this.selectedElement());
    const { parentId: targetParentId, error } = this.clipboard.resolvePasteParentId(
      this.elements(),
      selectedContainer,
    );

    if (error) {
      this.apiError.set(error);
      return;
    }

    const pasted = this.clipboard.paste(this.elements(), targetParentId);
    if (!pasted || pasted.elements.length === 0) {
      return;
    }

    this.runWithHistory(() => {
      this.updateCurrentPageElements((elements) => [...elements, ...pasted.elements]);
      this.setSelectedElements(pasted.rootIds, pasted.rootIds[pasted.rootIds.length - 1] ?? null);
      this.editingTextElementId.set(null);
      this.currentTool.set('select');
    });

    this.apiError.set(null);
  }

  private deleteSelectedElement(): void {
    const selectedIds = this.getSelectionRootIds();
    if (selectedIds.length === 0) {
      return;
    }

    this.runWithHistory(() => {
      this.updateCurrentPageElements((elements) => {
        return selectedIds.reduce((nextElements, selectedId) => {
          const withoutElement = removeWithChildren(nextElements, selectedId);
          return withoutElement.filter((el) => el.primarySyncId !== selectedId);
        }, elements);
      });
      this.clearElementSelection();
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
          const firstSiblingIdx = withoutEl.findIndex((e) => (e.parentId ?? null) === parentId);
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
    const subtreeIds = new Set(collectSubtreeIds(this.elements(), elementId));
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

  private flipHorizontal(elementId: string): void {
    this.runWithHistory(() => {
      this.updateCurrentPageElements((elements) =>
        elements.map((el) => {
          if (el.id !== elementId) return el;
          const currentScale = el.scaleX ?? 1;
          return { ...el, scaleX: currentScale === -1 ? 1 : -1 };
        }),
      );
    });
  }

  private flipVertical(elementId: string): void {
    this.runWithHistory(() => {
      this.updateCurrentPageElements((elements) =>
        elements.map((el) => {
          if (el.id !== elementId) return el;
          const currentScale = el.scaleY ?? 1;
          return { ...el, scaleY: currentScale === -1 ? 1 : -1 };
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
      onSelectTool: (tool) => this.onToolbarToolSelected(tool),
      onSpaceDown: () => this.viewport.isSpacePressed.set(true),
      onSpaceUp: () => this.viewport.isSpacePressed.set(false),
      onZoomIn: () => this.viewport.zoomIn(this.getCanvasElement()),
      onZoomOut: () => this.viewport.zoomOut(this.getCanvasElement()),
    };
  }

  private buildContextMenuCallbacks(): ContextMenuActionCallbacks {
    return {
      onCopy: () => this.copySelectedElement(),
      onPaste: () => this.pasteClipboard(),
      onDelete: (id) => {
        const selectedIds = this.getSelectionRootIds();
        const targetIds =
          selectedIds.length > 1 && selectedIds.includes(id)
            ? selectedIds
            : this.getSelectionRootIds([id]);

        this.runWithHistory(() => {
          this.updateCurrentPageElements((elements) => {
            return targetIds.reduce((nextElements, targetId) => {
              const withoutElement = removeWithChildren(nextElements, targetId);
              return withoutElement.filter((el) => el.primarySyncId !== targetId);
            }, elements);
          });
          this.clearElementSelection();
        });
      },
      onBringToFront: (id) => this.bringToFront(id),
      onSendToBack: (id) => this.sendToBack(id),
      onMoveToPage: (id, pageId) => this.moveToPage(id, pageId),
      onFlipHorizontal: (id) => this.flipHorizontal(id),
      onFlipVertical: (id) => this.flipVertical(id),
      onRename: (id) => {
        window.dispatchEvent(new CustomEvent('canvas:rename-request', { detail: { id } }));
      },
      onToggleVisibility: (id) => {
        const pageId = this.currentPageId();
        if (!pageId) {
          return;
        }

        this.onLayerVisibilityToggled({ pageId, id });
      },
      onSetAsPrimary: (id) => this.setPrimaryFrame(id),
    };
  }

  // ── Primary Frame ─────────────────────────────────────────

  private getPrimaryFrame(elements: CanvasElement[]): CanvasElement | null {
    const rootFrames = elements.filter((el) => el.type === 'frame' && !el.parentId);
    return (
      rootFrames.find((el) => el.isPrimary) ??
      rootFrames.find((el) => el.name?.toLowerCase() === 'desktop') ??
      rootFrames[0] ??
      null
    );
  }

  private setPrimaryFrame(elementId: string): void {
    this.runWithHistory(() => {
      this.updateCurrentPageElements((elements) =>
        elements.map((el) =>
          el.type === 'frame' && !el.parentId ? { ...el, isPrimary: el.id === elementId } : el,
        ),
      );
    });
  }

  private createSyncedCopies(
    newElement: CanvasElement,
    elements: CanvasElement[],
  ): CanvasElement[] {
    const primaryFrame = this.getPrimaryFrame(elements);
    if (!primaryFrame || newElement.parentId !== primaryFrame.id) {
      return [];
    }

    const otherRootFrames = elements.filter(
      (el) => el.type === 'frame' && !el.parentId && el.id !== primaryFrame.id,
    );

    return otherRootFrames.map((frame) => ({
      ...newElement,
      id: crypto.randomUUID(),
      parentId: frame.id,
      primarySyncId: newElement.id,
      x:
        primaryFrame.width > 0
          ? roundToTwoDecimals((newElement.x / primaryFrame.width) * frame.width)
          : newElement.x,
      y:
        primaryFrame.height > 0
          ? roundToTwoDecimals((newElement.y / primaryFrame.height) * frame.height)
          : newElement.y,
      width: newElement.width,
      height: newElement.height,
    }));
  }

  private syncElementPatchToPrimary(
    elementId: string,
    patch: Partial<CanvasElement>,
    elements: CanvasElement[],
  ): CanvasElement[] {
    const element = elements.find((el) => el.id === elementId);
    if (!element || !element.parentId) {
      return elements;
    }

    const primaryFrame = this.getPrimaryFrame(elements);
    if (!primaryFrame || element.parentId !== primaryFrame.id) {
      return elements;
    }

    const otherRootFrames = elements.filter(
      (el) => el.type === 'frame' && !el.parentId && el.id !== primaryFrame.id,
    );

    return elements.map((el) => {
      if (el.primarySyncId !== elementId) {
        return el;
      }
      const parentFrame = otherRootFrames.find((f) => f.id === el.parentId);
      if (!parentFrame) {
        return el;
      }
      const scaleX = primaryFrame.width > 0 ? parentFrame.width / primaryFrame.width : 1;
      const scaleY = primaryFrame.height > 0 ? parentFrame.height / primaryFrame.height : 1;
      const syncedPatch: Partial<CanvasElement> = { ...patch };
      if (patch.x !== undefined) syncedPatch.x = roundToTwoDecimals(patch.x * scaleX);
      if (patch.y !== undefined) syncedPatch.y = roundToTwoDecimals(patch.y * scaleY);
      if (patch.width !== undefined) syncedPatch.width = patch.width;
      if (patch.height !== undefined) syncedPatch.height = patch.height;
      return { ...el, ...syncedPatch };
    });
  }

  private syncElementMoveToPrimary(
    movedElement: CanvasElement | null,
    elements: CanvasElement[],
  ): CanvasElement[] {
    if (!movedElement || !movedElement.parentId) {
      return elements;
    }

    const primaryFrame = this.getPrimaryFrame(elements);
    if (!primaryFrame || movedElement.parentId !== primaryFrame.id) {
      return elements;
    }

    const otherRootFrames = elements.filter(
      (el) => el.type === 'frame' && !el.parentId && el.id !== primaryFrame.id,
    );

    const syncId = movedElement.id;

    return elements.map((el) => {
      if (el.primarySyncId !== syncId) {
        return el;
      }
      const parentFrame = otherRootFrames.find((f) => f.id === el.parentId);
      if (!parentFrame) {
        return el;
      }
      return {
        ...el,
        x:
          primaryFrame.width > 0
            ? roundToTwoDecimals((movedElement.x / primaryFrame.width) * parentFrame.width)
            : movedElement.x,
        y:
          primaryFrame.height > 0
            ? roundToTwoDecimals((movedElement.y / primaryFrame.height) * parentFrame.height)
            : movedElement.y,
        width: movedElement.width,
        height: movedElement.height,
      };
    });
  }

  private syncPrimaryFrameResize(
    resizedFrame: CanvasElement,
    elements: CanvasElement[],
  ): CanvasElement[] {
    const primaryFrame = this.getPrimaryFrame(elements);
    if (!primaryFrame || resizedFrame.id !== primaryFrame.id) {
      return elements;
    }

    const newW = resizedFrame.width;
    const newH = resizedFrame.height;
    const otherRootFrames = elements.filter(
      (el) => el.type === 'frame' && !el.parentId && el.id !== primaryFrame.id,
    );

    return elements.map((el) => {
      // Re-anchor synced children proportionally using new primary size
      const parentFrame = otherRootFrames.find((f) => f.id === el.parentId);
      if (!parentFrame || !el.primarySyncId) {
        return el;
      }
      const source = elements.find((e) => e.id === el.primarySyncId);
      if (!source) {
        return el;
      }
      return {
        ...el,
        x: newW > 0 ? roundToTwoDecimals((source.x / newW) * parentFrame.width) : el.x,
        y: newH > 0 ? roundToTwoDecimals((source.y / newH) * parentFrame.height) : el.y,
      };
    });
  }

  private breakSyncOnParentChange(
    elementId: string,
    prevParentId: string | null,
    elements: CanvasElement[],
  ): CanvasElement[] {
    if (!elementId) return elements;

    const current = elements.find((e) => e.id === elementId);
    if (!current) return elements;

    const currentParentId = current.parentId ?? null;
    if (currentParentId === prevParentId) return elements;

    const primaryFrame = this.getPrimaryFrame(elements);

    // Synced copy was moved out of its parent frame → clear its own sync link
    if (current.primarySyncId) {
      return elements.map((e) => (e.id === elementId ? { ...e, primarySyncId: undefined } : e));
    }

    // Primary element moved out of primary frame → break all synced copies
    if (primaryFrame && prevParentId === primaryFrame.id && currentParentId !== primaryFrame.id) {
      return elements.map((e) =>
        e.primarySyncId === elementId ? { ...e, primarySyncId: undefined } : e,
      );
    }

    return elements;
  }
}
