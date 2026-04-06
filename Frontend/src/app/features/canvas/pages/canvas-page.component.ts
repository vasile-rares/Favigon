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
import { mutateNormalizeElement } from '../utils/canvas-interaction.util';
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
  FlowDragRenderState,
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
import { CanvasPixiApplicationService } from '../services/canvas-pixi-application.service';
import { CanvasPixiRendererService } from '../services/canvas-pixi-renderer.service';
import { CanvasPixiOverlaysService } from '../services/canvas-pixi-overlays.service';
import { CanvasPixiGridService } from '../services/canvas-pixi-grid.service';
import { CanvasPixiPageShellService } from '../services/canvas-pixi-page-shell.service';
import { CanvasPixiLayoutService } from '../services/canvas-pixi-layout.service';

const ROOT_FRAME_INSERT_GAP = 48;
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
    CanvasPixiApplicationService,
    CanvasPixiRendererService,
    CanvasPixiOverlaysService,
    CanvasPixiGridService,
    CanvasPixiPageShellService,
    CanvasPixiLayoutService,
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

  // ── PixiJS Services ───────────────────────────────────────
  private readonly pixiApp = inject(CanvasPixiApplicationService);
  private readonly pixiRenderer = inject(CanvasPixiRendererService);
  private readonly pixiOverlays = inject(CanvasPixiOverlaysService);
  private readonly pixiGrid = inject(CanvasPixiGridService);
  private readonly pixiPageShells = inject(CanvasPixiPageShellService);
  private readonly pixiLayout = inject(CanvasPixiLayoutService);
  private pixiInitPending = false;
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

  readonly currentPageName = computed(() => this.currentPage()?.name ?? 'Untitled page');

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
  private dragSelectionStartParentIds = new Map<string, string | null>();
  private isElementDragPrimed = false;
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
  readonly snapLines = signal<SnapLine[]>([]);
  readonly rectangleDrawPreview = signal<Bounds | null>(null);
  readonly editingTextDraft = signal('');
  readonly flowDragPlaceholder = signal<{ elementId: string; bounds: Bounds } | null>(null);
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
  private suppressNextWindowMenuClose = false;
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

    // ── PixiJS Sync Effects ─────────────────────────────────

    // Sync viewport (pan + zoom) to PixiJS containers
    effect(() => {
      const offset = this.viewport.viewportOffset();
      const zoom = this.viewport.zoomLevel();
      this.pixiApp.syncViewport(offset.x, offset.y, zoom);
      this.pixiGrid.syncGrid(offset.x, offset.y, zoom);
    });

    // Sync elements + page layouts → PixiJS renderer
    effect(() => {
      if (!this.pixiApp.ready()) return;
      const pages = this.pages();
      const currentPageId = this.currentPageId();
      const layouts = this.page.pageLayouts();
      const editingTextId = this.editingTextElementId();
      const zoom = this.viewport.zoomLevel();
      const selectedPageId = this.page.selectedCanvasPageId();
      const selectedElementIds = this.selectedElementIds();
      const isElementDragging = this.isDraggingEl();
      const selectedToolbarPageId =
        !isElementDragging && selectedElementIds.length === 0 ? selectedPageId : null;

      const pixiPages = pages.map((p) => {
        const layout = layouts.find((l) => l.pageId === p.id);
        return {
          pageId: p.id,
          elements: p.elements,
          layout: layout ?? {
            pageId: p.id,
            x: 0,
            y: 0,
            width: p.viewportWidth ?? 1280,
            height: p.viewportHeight ?? 720,
          },
        };
      });

      // Compute flow-drag render state from transient drag signals
      this.pixiRenderer.setEditingTextElementId(editingTextId);
      // Only activate when isDragging is true (after threshold exceeded),
      // not on pointerdown — so the element stays at its yoga position
      // and the selection outline remains correct until actual drag starts.
      const draggingId = this.draggingFlowChildId();
      const ghostBounds = this.flowDragPlaceholder();
      const dropTarget = this.layoutDropTarget();
      const flowDragState: FlowDragRenderState | null =
        isElementDragging && draggingId && ghostBounds
          ? {
              draggingElementId: draggingId,
              floatingBounds: ghostBounds.bounds,
              placeholder:
                this.isFlowDragInsideContainer && dropTarget
                  ? { containerId: dropTarget.containerId, dropIndex: dropTarget.index }
                  : null,
            }
          : null;

      this.pixiRenderer.syncPages(pixiPages, currentPageId, flowDragState, zoom);

      // Sync page shells
      const pageNames = new Map(pages.map((p) => [p.id, p.name]));
      const editingPageId = this.page.editingCanvasHeaderPageId();
      this.pixiPageShells.syncPageShells(
        layouts,
        currentPageId,
        this.viewport.zoomLevel(),
        pageNames,
        selectedToolbarPageId,
        editingPageId,
      );
    });

    // Sync selection overlay
    effect(() => {
      if (!this.pixiApp.ready()) return;
      const selected = this.selectedElement();
      const elements = this.elements();
      const zoom = this.viewport.zoomLevel();
      const layout = this.page.activePageLayout();
      const isDragging = this.isDraggingEl();
      const editingText = this.editingTextElementId();

      if (isDragging || editingText) {
        this.pixiOverlays.drawSelectionOutline(null, elements, zoom, layout, false);
        return;
      }

      const showHandles = !!selected && selected.type !== 'frame' && selected.type !== 'text';
      this.pixiOverlays.drawSelectionOutline(selected, elements, zoom, layout, showHandles);

      // Multi-selection outlines
      const selectedElements = this.selectedElements();
      if (selectedElements.length > 1) {
        this.pixiOverlays.drawMultiSelectionOutlines(selectedElements, elements, zoom, layout);
      }
    });

    // Sync hover outline
    effect(() => {
      if (!this.pixiApp.ready()) return;
      const hoveredId = this.hoveredElementId();
      const elements = this.elements();
      const zoom = this.viewport.zoomLevel();
      const layout = this.page.activePageLayout();
      const isDragging = this.isDraggingEl();
      const selectedIds = this.selectedElementIds();

      if (!hoveredId || isDragging || selectedIds.includes(hoveredId)) {
        this.pixiOverlays.drawHoverOutline(null, elements, zoom, layout);
        return;
      }

      const hovered = this.el.findElementById(hoveredId, elements);
      if (hovered?.type === 'frame') {
        this.pixiOverlays.drawHoverOutline(null, elements, zoom, layout);
        return;
      }

      this.pixiOverlays.drawHoverOutline(hovered, elements, zoom, layout);
    });

    // Sync snap lines
    effect(() => {
      if (!this.pixiApp.ready()) return;
      const lines = this.snapLines();
      const zoom = this.viewport.zoomLevel();
      const layout = this.page.activePageLayout();
      this.pixiOverlays.drawSnapLines(lines, zoom, layout);
    });

    // Sync rectangle draw preview
    effect(() => {
      if (!this.pixiApp.ready()) return;
      const preview = this.rectangleDrawPreview();
      const layout = this.page.activePageLayout();
      this.pixiOverlays.drawRectanglePreview(preview, layout);
    });

    // Sync page shell selection outline
    effect(() => {
      if (!this.pixiApp.ready()) return;
      const isDragging = this.isDraggingEl();
      const zoom = this.viewport.zoomLevel();

      void isDragging;
      void zoom;
      this.pixiOverlays.drawPageShellSelectionOutline(null, 1);
    });
  }

  ngAfterViewChecked(): void {
    this.page.setCanvasElement(this.getCanvasElement());

    // Initialize PixiJS once the canvas container DOM element is available
    if (!this.pixiInitPending) {
      const canvasHost = document.querySelector('.canvas-container') as HTMLElement | null;
      if (canvasHost) {
        this.pixiInitPending = true;
        this.zone.runOutsideAngular(() => {
          Promise.all([this.pixiApp.init(canvasHost), this.pixiLayout.init()]).then(() => {
            this.pixiGrid.init();
            this.pixiRenderer.init();
            this.pixiOverlays.init();
            this.pixiPageShells.init();
            this.setupPixiEventListeners();
          });
        });
      }
    }

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

    this.persistThumbnailIfDue();

    // Cleanup PixiJS
    this.pixiRenderer.destroy();
    this.pixiOverlays.destroy();
    this.pixiGrid.destroy();
    this.pixiPageShells.destroy();
    this.pixiLayout.destroy();
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

  private selectPageFromToolbar(pageId: string): void {
    this.suppressNextCanvasClick = true;

    if (pageId === this.currentPageId()) {
      this.page.onActivePageShellClick(pageId);
      return;
    }

    this.page.selectPageWithoutFocus(pageId);
  }

  onPageNamePointerDown(event: MouseEvent, pageId: string): void {
    if (this.page.editingCanvasHeaderPageId() === pageId) {
      event.stopPropagation();
      return;
    }

    if (event.button !== 0) {
      return;
    }

    this.selectPageFromToolbar(pageId);

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

    if (pageId === this.currentPageId()) {
      if (this.startRectangleDraw(event, true)) {
        return;
      }

      const tool = this.currentTool();
      if (tool !== 'select') {
        const pointer = this.getActivePageCanvasPoint(event);
        if (!pointer) {
          return;
        }

        event.preventDefault();
        event.stopPropagation();
        this.suppressNextPageShellClick = true;
        this.page.clearSelectedPageLayer();
        this.page.layersFocusedPageId.set(pageId);
        this.createElementAtCanvasPoint(tool, pointer);
        return;
      }
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
          this.finalizeTextEditing(editingId);
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

    const newElement = this.createElementAtCanvasPoint(tool, pointer);
    if (!newElement) {
      return;
    }
  }

  // ── Element Events ────────────────────────────────────────

  onElementPointerDown(event: MouseEvent, id: string): void {
    const target = event.target as HTMLElement;
    this.flowDragPlaceholder.set(null);
    this.suppressNextCanvasClick = true;

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
      this.finalizeTextEditing(editingId);
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

    event.preventDefault();
    event.stopPropagation();
    this.page.layersFocusedPageId.set(this.currentPageId());

    const tool = this.currentTool();
    if (tool !== 'select') {
      const clickedElement = elementForTypeCheck ?? this.el.findElementById(id, this.elements());
      const pointer = this.getActivePageCanvasPoint(event);
      if (!pointer) {
        return;
      }

      const targetContainer =
        clickedElement && this.el.isContainerElement(clickedElement)
          ? clickedElement
          : this.resolveInsertionContainer(pointer);
      const containerBounds = targetContainer
        ? this.el.getAbsoluteBounds(targetContainer, this.elements(), this.currentPage())
        : null;

      this.createElementAtCanvasPoint(tool, pointer, targetContainer, containerBounds);
      return;
    }

    if (!this.isElementSelected(id)) {
      this.selectOnlyElement(id);
    } else {
      this.selectedElementId.set(id);
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

    this.hasMovedElementDuringDrag = false;
    this.isElementDragPrimed = true;
    this.dragOffset = {
      x: pointer.x - bounds.x,
      y: pointer.y - bounds.y,
    };
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
    this.startTextEditing(id);
  }

  onTextEditorPointerDown(event: MouseEvent): void {
    event.stopPropagation();
  }

  onTextEditorInput(id: string, event: Event): void {
    this.history.beginTextEditHistory(() => this.createHistorySnapshot());
    this.editingTextDraft.set(this.readInlineTextEditorValue(event.target as HTMLElement | null));
  }

  onTextEditorBlur(id: string): void {
    this.finalizeTextEditing(id);
  }

  onTextEditorKeyDown(event: KeyboardEvent, id: string): void {
    event.stopPropagation();
    if (event.key !== 'Escape') {
      return;
    }
    event.preventDefault();
    const removed = this.finalizeTextEditing(id);
    if (!removed && this.selectedElementId() !== id) {
      this.selectedElementId.set(id);
    }
    (event.target as HTMLElement | null)?.blur();
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
    this.suppressNextCanvasClick = true;

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
    this.suppressNextCanvasClick = true;

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
      const insideCanvas =
        event.clientX >= rect.left &&
        event.clientX <= rect.right &&
        event.clientY >= rect.top &&
        event.clientY <= rect.bottom;

      if (insideCanvas) {
        this.pixiGrid.updatePointerGlow(event.clientX - rect.left, event.clientY - rect.top);
      } else {
        this.pixiGrid.hideGlow();
      }
    } else {
      this.pixiGrid.hideGlow();
    }

    const hasActivePointerGesture =
      this.isDraggingPage ||
      !!this.rectangleDrawState ||
      this.viewport.isPanning() ||
      this.isRotating ||
      this.isResizing ||
      this.isAdjustingCornerRadius ||
      this.isElementDragPrimed ||
      this.isDragging;

    if (hasActivePointerGesture && event.buttons === 0) {
      this.onPointerUp(event);
      return;
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

    if (this.isElementDragPrimed && !this.isDragging) {
      const selectedId = this.selectedElementId();
      if (!selectedId) {
        this.isElementDragPrimed = false;
        return;
      }

      const pointer = this.getActivePageCanvasPoint(event);
      if (!pointer) {
        return;
      }

      const absoluteX = pointer.x - this.dragOffset.x;
      const absoluteY = pointer.y - this.dragOffset.y;
      const dragDistance = Math.hypot(
        absoluteX - this.dragStartAbsolute.x,
        absoluteY - this.dragStartAbsolute.y,
      );

      if (dragDistance < ELEMENT_DRAG_START_THRESHOLD) {
        return;
      }

      this.beginGestureHistory();
      this.hasMovedElementDuringDrag = true;
      this.isDragging = true;
      this.isElementDragPrimed = false;
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
          return {
            ...element,
            ...this.resolveDraggedElementPatch(element, elements, nextAbsoluteX, nextAbsoluteY),
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

        return {
          ...element,
          ...this.resolveDraggedElementPatch(element, elements, absoluteX, absoluteY),
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
    if (this.suppressNextWindowMenuClose) {
      this.suppressNextWindowMenuClose = false;
      return;
    }

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
    const prevParentId = selectedOnDrop
      ? (this.dragSelectionStartParentIds.get(selectedOnDrop.id) ?? selectedOnDrop.parentId ?? null)
      : null;
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
        if (this.isResizing && freshEl?.type === 'frame' && !freshEl.parentId) {
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
    this.isElementDragPrimed = false;
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
    this.dragSelectionStartParentIds = new Map();

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

  isPanReady(): boolean {
    return this.currentTool() === 'select' || this.viewport.isSpacePressed();
  }

  // ── Page name editor positioning ──────────────────────────

  getPageNameEditorLeft(pageId: string): number {
    const offset = this.viewport.viewportOffset();
    const layouts = this.page.pageLayouts();
    return offset.x + this.pageLayout.getPageShellHeaderScreenLeft(pageId, layouts) + 50;
  }

  getPageNameEditorTop(pageId: string): number {
    const offset = this.viewport.viewportOffset();
    const layouts = this.page.pageLayouts();
    return offset.y + this.pageLayout.getPageShellHeaderScreenTop(pageId, layouts) + 9;
  }

  getPageNameEditorWidth(pageId: string): number {
    return Math.max(96, this.getPageShellToolbarWidth(pageId) - 120);
  }

  private getPageShellToolbarWidth(pageId: string): number {
    const layouts = this.page.pageLayouts();
    const shellWidth = this.pageLayout.getPageShellHeaderScreenWidth(pageId, layouts);
    return roundToTwoDecimals(shellWidth);
  }

  isElementSelected(id: string): boolean {
    return this.selectedElementIds().includes(id);
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
    this.dragSelectionStartParentIds = new Map(
      dragIds.map((id) => [id, this.el.findElementById(id, elements)?.parentId ?? null]),
    );
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

    for (let i = 0; i < siblings.length; i++) {
      const siblingBounds =
        this.getLiveElementCanvasBounds(siblings[i]) ??
        this.getFlowAwareBounds(siblings[i], elements);
      const sibAbsX = siblingBounds.x;
      const sibAbsY = siblingBounds.y;

      if (isRow) {
        if (absoluteX < sibAbsX + siblingBounds.width / 2) return i;
      } else {
        if (absoluteY < sibAbsY + siblingBounds.height / 2) return i;
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

  private alignRootFramesOnDrop(): void {
    this.updateCurrentPageElements((elements) => this.reflowRootFrames(elements));
  }

  private getLiveOverlaySceneBounds(element: CanvasElement): Bounds | null {
    void this.flowCacheVersion(); // track for overlay reactivity

    const sceneEl = this.canvasSceneRef?.nativeElement;
    if (sceneEl) {
      const domEl = sceneEl.querySelector<HTMLElement>(`[data-element-id="${element.id}"]`);
      if (domEl) {
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
    }

    return this.getLivePixiSceneBounds(element);
  }

  private getLivePixiSceneBounds(element: CanvasElement): Bounds | null {
    if (!this.pixiApp.ready()) {
      return null;
    }

    const renderedBounds = this.pixiRenderer.getRenderedNodeSceneBounds(element.id);
    if (renderedBounds) {
      return renderedBounds;
    }

    const container = this.pixiRenderer.getContainerForElement(element.id);
    if (!container || container.destroyed) {
      return null;
    }

    const globalPos = container.toGlobal({ x: 0, y: 0 });
    const scenePos = this.pixiApp.sceneContainer.toLocal(globalPos);
    const renderedSize = this.pixiRenderer.getRenderedNodeSize(element.id);
    const absoluteBounds = this.el.getAbsoluteBounds(element, this.elements(), this.currentPage());

    return {
      x: roundToTwoDecimals(scenePos.x),
      y: roundToTwoDecimals(scenePos.y),
      width: roundToTwoDecimals(
        renderedSize && renderedSize.width > 0 ? renderedSize.width : absoluteBounds.width,
      ),
      height: roundToTwoDecimals(
        renderedSize && renderedSize.height > 0 ? renderedSize.height : absoluteBounds.height,
      ),
    };
  }

  private getCachedOverlaySceneBounds(element: CanvasElement): Bounds {
    void this.flowCacheVersion(); // track for overlay reactivity

    const cached = this.flowBoundsDirty ? undefined : this.flowBoundsCache.get(element.id);
    if (cached) {
      return cached;
    }

    const livePixiBounds = this.getLivePixiSceneBounds(element);
    if (livePixiBounds) {
      return livePixiBounds;
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

  /** Returns the element currently being text-edited, or null. */
  getTextEditorElement(): CanvasElement | null {
    const id = this.editingTextElementId();
    if (!id) return null;
    return this.el.findElementById(id, this.elements()) ?? null;
  }

  private getTextEditorDisplayBounds(): Bounds | null {
    const el = this.getTextEditorElement();
    if (!el) return null;

    const bounds =
      this.getLiveElementCanvasBounds(el) ?? this.el.getAbsoluteBounds(el, this.elements());
    const draft = this.editingTextDraft();
    if (!draft || draft === (el.text ?? '')) {
      return bounds;
    }

    const widthConstraint = this.canAutoSizeTextAxis(el, 'width') ? undefined : bounds.width;
    const size = this.measureTextSize({ ...el, text: draft }, widthConstraint);
    const nextBounds: Bounds = { ...bounds };

    if (this.canAutoSizeTextAxis(el, 'width')) {
      const centerX = bounds.x + bounds.width / 2;
      nextBounds.x = roundToTwoDecimals(centerX - size.width / 2);
      nextBounds.width = size.width;
    }

    if (this.canAutoSizeTextAxis(el, 'height')) {
      nextBounds.height = size.height;
    }

    return nextBounds;
  }

  private canAutoSizeTextAxis(element: CanvasElement, axis: 'width' | 'height'): boolean {
    if (element.type !== 'text') {
      return false;
    }

    const mode =
      axis === 'width' ? (element.widthMode ?? 'fixed') : (element.heightMode ?? 'fixed');
    return mode === 'fixed' || mode === 'fit-content';
  }

  private buildAutoSizedTextPatch(
    previousElement: CanvasElement,
    nextElement: CanvasElement,
  ): Partial<CanvasElement> | null {
    const widthConstraint = this.canAutoSizeTextAxis(previousElement, 'width')
      ? undefined
      : this.el.getRenderedWidth(previousElement, this.elements(), this.currentPage());
    const size = this.measureTextSize(nextElement, widthConstraint);
    const patch: Partial<CanvasElement> = {};

    if (this.canAutoSizeTextAxis(previousElement, 'width')) {
      const centerX = previousElement.x + previousElement.width / 2;
      patch.x = roundToTwoDecimals(centerX - size.width / 2);
      patch.width = size.width;
    }

    if (this.canAutoSizeTextAxis(previousElement, 'height')) {
      patch.height = size.height;
    }

    return Object.keys(patch).length > 0 ? patch : null;
  }

  getTextEditorScreenLeft(): number {
    const bounds = this.getTextEditorDisplayBounds();
    if (!bounds) return 0;
    const layout = this.page.activePageLayout();
    const offset = this.viewport.viewportOffset();
    return (layout!.x + bounds.x) * this.viewport.zoomLevel() + offset.x;
  }

  getTextEditorScreenTop(): number {
    const bounds = this.getTextEditorDisplayBounds();
    if (!bounds) return 0;
    const layout = this.page.activePageLayout();
    const offset = this.viewport.viewportOffset();
    return (layout!.y + bounds.y) * this.viewport.zoomLevel() + offset.y;
  }

  getTextEditorScreenWidth(): number {
    const bounds = this.getTextEditorDisplayBounds();
    if (!bounds) return 0;
    return bounds.width;
  }

  getTextEditorScreenHeight(): number {
    const bounds = this.getTextEditorDisplayBounds();
    if (!bounds) return 0;
    return bounds.height;
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
    this.pixiGrid.hideGlow();
    this.isElementDragPrimed = false;
    this.isDragging = false;
    this.isResizing = false;
    this.isRotating = false;
    this.history.commitGestureHistory(() => this.createHistorySnapshot());
    this.finalizeTextEditing(this.editingTextElementId());
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

    this.rectangleDrawState = {
      ...state,
      currentPoint: pointer,
    };
    this.rectangleDrawPreview.set(this.buildRectangleDrawBounds(state.startPoint, pointer));
  }

  private commitRectangleDraw(): void {
    const state = this.rectangleDrawState;
    if (!state) {
      return;
    }
    const bounds = this.buildRectangleDrawBounds(state.startPoint, state.currentPoint);
    const distance = Math.hypot(
      state.currentPoint.x - state.startPoint.x,
      state.currentPoint.y - state.startPoint.y,
    );

    if (distance < ELEMENT_DRAG_START_THRESHOLD) {
      this.createElementAtCanvasPoint('rectangle', state.startPoint);
      return;
    }

    const container = this.resolveInsertionContainerForBounds(bounds);
    const containerBounds = container
      ? this.el.getAbsoluteBounds(container, this.elements(), this.currentPage())
      : null;

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
      target.tagName === 'CANVAS' ||
      target.classList.contains('canvas-container') ||
      target.classList.contains('canvas-viewport') ||
      target.classList.contains('canvas-scene')
    );
  }

  private getCanvasElement(): HTMLElement | null {
    return document.querySelector('.canvas-container') as HTMLElement | null;
  }

  /** Set up PixiJS stage event listeners to forward interactions to existing handlers. */
  private setupPixiEventListeners(): void {
    const app = this.pixiApp.pixiApp;
    if (!app) return;

    // ── Element interactions (pointerdown, hover, dblclick, contextmenu) ──
    // Listen on the scene container to catch all element events via bubbling.
    const sceneContainer = this.pixiApp.sceneContainer;

    sceneContainer.eventMode = 'static';
    sceneContainer.on('pointerdown', (e) => {
      const elId = this.pixiRenderer.getElementIdFromTarget(e.target as any);
      if (!elId) return;
      const native = e.nativeEvent as MouseEvent;
      // Prevent the canvas-container DOM handler from also firing
      native.stopPropagation();
      this.zone.run(() => this.onElementPointerDown(native, elId));
    });

    // Stop the native click from bubbling to .canvas-container when a PixiJS element
    // was clicked — otherwise onCanvasClick() would fire and clear the selection.
    sceneContainer.on('click', (e) => {
      const elId = this.pixiRenderer.getElementIdFromTarget(e.target as any);
      if (!elId) return;
      (e.nativeEvent as MouseEvent).stopPropagation();
    });

    sceneContainer.on('pointerover', (e) => {
      const elId = this.pixiRenderer.getElementIdFromTarget(e.target as any);
      if (!elId) return;
      this.zone.run(() => this.hoveredElementId.set(elId));
    });

    sceneContainer.on('pointerout', (e) => {
      const elId = this.pixiRenderer.getElementIdFromTarget(e.target as any);
      if (!elId) return;
      this.zone.run(() => {
        if (this.hoveredElementId() === elId) {
          this.hoveredElementId.set(null);
        }
      });
    });

    sceneContainer.on('rightclick', (e) => {
      const elId = this.pixiRenderer.getElementIdFromTarget(e.target as any);
      if (!elId) return;
      const native = e.nativeEvent as MouseEvent;
      native.stopPropagation();
      native.preventDefault();
      this.zone.run(() => this.onElementContextMenu(native, elId));
    });

    // Double-click for text editing
    let lastPointerDownTime = 0;
    let lastPointerDownId: string | null = null;
    sceneContainer.on('pointerdown', (e) => {
      const elId = this.pixiRenderer.getElementIdFromTarget(e.target as any);
      if (!elId) return;
      const now = Date.now();
      if (elId === lastPointerDownId && now - lastPointerDownTime < 400) {
        const native = e.nativeEvent as MouseEvent;
        this.zone.run(() => this.onElementDoubleClick(native, elId));
        lastPointerDownId = null;
        lastPointerDownTime = 0;
      } else {
        lastPointerDownId = elId;
        lastPointerDownTime = now;
      }
    });

    // ── Page shell interactions ──
    this.pixiPageShells.onShellPointerDown((pageId, pixiEvent) => {
      const native = pixiEvent.nativeEvent as MouseEvent;
      native.stopPropagation();
      this.zone.run(() => this.onPageShellPointerDown(native, pageId));
    });

    this.pixiPageShells.onShellClick((pageId) => {
      this.zone.run(() => {
        if (pageId === this.currentPageId()) {
          this.onActivePageShellClick(pageId);
        } else {
          this.onInactivePageShellClick(pageId);
        }
      });
    });

    // ── Page header interactions ──
    this.pixiPageShells.onHeaderPointerDown((pageId, pixiEvent) => {
      const native = pixiEvent.nativeEvent as MouseEvent;
      native.stopPropagation();
      this.zone.run(() => {
        if (native.button !== 0) {
          return;
        }

        this.selectPageFromToolbar(pageId);
      });
    });

    this.pixiPageShells.onHeaderPlayClick((pageId) => {
      this.zone.run(() => {
        this.selectPageFromToolbar(pageId);
        this.page.openPreviewForPage(this.projectId, pageId);
      });
    });

    this.pixiPageShells.onHeaderNamePointerDown((pageId, pixiEvent) => {
      const native = pixiEvent.nativeEvent as MouseEvent;
      native.stopPropagation();
      this.zone.run(() => this.onPageNamePointerDown(native, pageId));
    });

    this.pixiPageShells.onHeaderNameDblClick((pageId) => {
      this.zone.run(() => {
        this.selectPageFromToolbar(pageId);
        const syntheticEvent = {
          preventDefault: () => {},
          stopPropagation: () => {},
        } as MouseEvent;
        this.page.onCanvasHeaderPageNameDoubleClick(syntheticEvent, pageId);
      });
    });

    this.pixiPageShells.onHeaderAddDeviceClick((pageId) => {
      const canvasEl = this.getCanvasElement();
      const layouts = this.page.pageLayouts();
      const offset = this.viewport.viewportOffset();
      const canvasRect = canvasEl?.getBoundingClientRect() ?? { left: 0, top: 0 };
      const headerLeft =
        canvasRect.left + offset.x + this.pageLayout.getPageShellHeaderScreenLeft(pageId, layouts);
      const headerTop =
        canvasRect.top + offset.y + this.pageLayout.getPageShellHeaderScreenTop(pageId, layouts);
      const headerWidth = this.getPageShellToolbarWidth(pageId);
      const btnLeft = headerLeft + headerWidth - 38;
      const btnBottom = headerTop + 36;
      this.suppressNextWindowMenuClose = true;
      this.zone.run(() => {
        this.selectPageFromToolbar(pageId);
        this.page.openDeviceFrameMenuAt(btnLeft, btnBottom, pageId);
      });
    });

    this.pixiPageShells.onFrameTitlePointerDown((pageId, frameId) => {
      this.zone.run(() => {
        if (this.currentPageId() !== pageId) {
          this.currentPageId.set(pageId);
        }
        this.page.layersFocusedPageId.set(pageId);
        this.page.selectedPageLayerId.set(null);
        this.currentTool.set('select');
        this.suppressNextCanvasClick = true;
        this.selectOnlyElement(frameId);
      });
    });

    // ── Selection overlay handle events ──
    this.pixiOverlays.onHandlePointerDown((handle, pixiEvent) => {
      const selEl = this.selectedElement();
      if (!selEl) return;
      const nativeEvent = pixiEvent.nativeEvent as MouseEvent;
      nativeEvent.stopPropagation();
      nativeEvent.preventDefault();
      this.zone.run(() => {
        this.onResizeHandlePointerDown(nativeEvent, selEl.id, handle);
      });
    });

    this.pixiOverlays.onCornerRadiusHandlePointerDown((pixiEvent) => {
      const selEl = this.selectedElement();
      if (!selEl) return;
      const nativeEvent = pixiEvent.nativeEvent as MouseEvent;
      nativeEvent.stopPropagation();
      nativeEvent.preventDefault();
      this.zone.run(() => {
        this.onCornerRadiusHandlePointerDown(nativeEvent, selEl.id);
      });
    });

    // ── Selection outline pointerdown (interior click-through + edge resize) ──
    this.pixiOverlays.onSelectionOutlinePointerDown((pixiEvent) => {
      const selEl = this.selectedElement();
      if (!selEl) return;
      const native = pixiEvent.nativeEvent as MouseEvent;
      native.stopPropagation();
      this.zone.run(() => this.onSelectionOutlinePointerDown(native, selEl.id));
    });

    // ── Selection outline double-click for text editing ──
    this.pixiOverlays.onSelectionOutlineDoubleClick((pixiEvent) => {
      const selEl = this.selectedElement();
      if (!selEl) return;
      const native = pixiEvent.nativeEvent as MouseEvent;
      this.zone.run(() => this.onElementDoubleClick(native, selEl.id));
    });

    // ── Selection outline context menu ──
    this.pixiOverlays.onSelectionOutlineContextMenu((pixiEvent) => {
      const selEl = this.selectedElement();
      if (!selEl) return;
      const native = pixiEvent.nativeEvent as MouseEvent;
      native.preventDefault();
      native.stopPropagation();
      this.zone.run(() => this.onElementContextMenu(native, selEl.id));
    });
  }

  /** Returns the id of the topmost non-frame element whose bounds contain (x, y)
   *  in active-page coordinates, preferring deeper nested children over parents. */
  private getTopElementIdAtPoint(x: number, y: number): string | null {
    const elements = this.visibleElements();
    let bestId: string | null = null;
    let bestDepth = -1;

    for (let i = 0; i < elements.length; i++) {
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

  private resolveInsertionContainer(
    pointer: Point,
    requiredSize?: { width: number; height: number },
  ): CanvasElement | null {
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
        pointer.y <= bounds.y + bounds.height &&
        this.canContainerFitSize(element, requiredSize)
      );
    });

    if (hoveredContainers.length > 0) {
      return this.getSmallestContainer(hoveredContainers);
    }

    const selectedContainer = this.el.getSelectedContainer(this.selectedElement());
    return selectedContainer && this.canContainerFitSize(selectedContainer, requiredSize)
      ? selectedContainer
      : null;
  }

  private resolveInsertionContainerForBounds(
    bounds: Bounds,
    excludedRootId?: string | null,
  ): CanvasElement | null {
    const elements = this.elements();
    const excludedIds = excludedRootId ? new Set(collectSubtreeIds(elements, excludedRootId)) : null;
    const hoveredContainers = elements.filter((element) => {
      if (
        !this.el.isContainerElement(element) ||
        !this.el.isElementEffectivelyVisible(element.id, elements) ||
        excludedIds?.has(element.id)
      ) {
        return false;
      }

      const containerBounds = this.el.getAbsoluteBounds(element, elements, this.currentPage());
      return this.isBoundsFullyInsideBounds(bounds, containerBounds);
    });

    return this.getSmallestContainer(hoveredContainers);
  }

  private resolveInsertionContext(pointer: Point): {
    container: CanvasElement | null;
    containerBounds: Bounds | null;
  };
  private resolveInsertionContext(
    pointer: Point,
    requiredSize?: { width: number; height: number },
  ): {
    container: CanvasElement | null;
    containerBounds: Bounds | null;
  } {
    const container = this.resolveInsertionContainer(pointer, requiredSize);
    return {
      container,
      containerBounds: container
        ? this.el.getAbsoluteBounds(container, this.elements(), this.currentPage())
        : null,
    };
  }

  private getSmallestContainer(containers: CanvasElement[]): CanvasElement | null {
    if (containers.length === 0) {
      return null;
    }

    return containers.reduce((best, candidate) => {
      const bestArea = best.width * best.height;
      const candidateArea = candidate.width * candidate.height;
      return candidateArea < bestArea ? candidate : best;
    });
  }

  private canContainerFitSize(
    container: CanvasElement,
    requiredSize?: { width: number; height: number },
  ): boolean {
    if (!requiredSize) {
      return true;
    }

    return container.width >= requiredSize.width && container.height >= requiredSize.height;
  }

  private isBoundsFullyInsideBounds(inner: Bounds, outer: Bounds): boolean {
    return (
      inner.x >= outer.x &&
      inner.y >= outer.y &&
      inner.x + inner.width <= outer.x + outer.width &&
      inner.y + inner.height <= outer.y + outer.height
    );
  }

  private resolveDraggedElementPatch(
    element: CanvasElement,
    elements: CanvasElement[],
    nextAbsoluteX: number,
    nextAbsoluteY: number,
  ): Partial<CanvasElement> {
    const parent = this.el.findElementById(element.parentId ?? null, elements);
    if (!parent) {
      return {
        x: roundToTwoDecimals(nextAbsoluteX),
        y: roundToTwoDecimals(nextAbsoluteY),
      };
    }

    const parentBounds = this.el.getAbsoluteBounds(parent, elements, this.currentPage());
    const nextBounds: Bounds = {
      x: nextAbsoluteX,
      y: nextAbsoluteY,
      width: element.width,
      height: element.height,
    };

    if (
      this.isContainerElement(parent) &&
      !this.isLayoutContainer(parent) &&
      !this.isBoundsFullyInsideBounds(nextBounds, parentBounds)
    ) {
      return {
        parentId: null,
        position: this.el.getDefaultPositionForPlacement(element.type, null),
        x: roundToTwoDecimals(nextAbsoluteX),
        y: roundToTwoDecimals(nextAbsoluteY),
      };
    }

    return {
      x: clamp(nextAbsoluteX - parentBounds.x, 0, parent.width - element.width),
      y: clamp(nextAbsoluteY - parentBounds.y, 0, parent.height - element.height),
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

    this.finalizeTextEditing(editingId);
  }

  private createElementAtCanvasPoint(
    tool: CanvasElementType,
    pointer: Point,
    targetContainer?: CanvasElement | null,
    containerBounds?: Bounds | null,
  ): CanvasElement | null {
    const requiredSize = this.el.getDefaultElementDimensions(tool, this.viewport.frameTemplate());
    const preferredContainer =
      tool === 'frame' || !targetContainer || !this.canContainerFitSize(targetContainer, requiredSize)
        ? null
        : targetContainer;
    const resolvedContainer =
      tool === 'frame'
        ? null
        : preferredContainer ?? this.resolveInsertionContainer(pointer, requiredSize);
    const resolvedContainerBounds = resolvedContainer
      ? targetContainer && resolvedContainer.id === targetContainer.id
        ? (containerBounds ??
          this.el.getAbsoluteBounds(resolvedContainer, this.elements(), this.currentPage()))
        : this.el.getAbsoluteBounds(resolvedContainer, this.elements(), this.currentPage())
      : null;

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
      this.startTextEditing(newElement.id);
    }

    return newElement;
  }

  /** After a drag, reparent the element to the smallest container that fully contains it. */
  private autoGroupOnDrop(): void {
    const id = this.selectedElementId();
    if (!id) return;

    const elements = this.elements();
    const element = this.el.findElementById(id, elements);
    if (!element || element.type === 'frame') return;

    const elementBounds = this.el.getAbsoluteBounds(element, elements, this.currentPage());
    const target = this.resolveInsertionContainerForBounds(elementBounds, id);

    if (!target || target.id === element.parentId) return;

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
      ) as HTMLElement | null;

      if (!editor) {
        return;
      }

      this.syncInlineTextEditorContent(editor, this.editingTextDraft());
      editor.focus();
      this.placeInlineTextEditorCaretAtEnd(editor);
    }, 0);
  }

  private syncInlineTextEditorContent(editor: HTMLElement, value: string): void {
    if (editor.textContent === value) {
      return;
    }

    editor.textContent = value;
  }

  private placeInlineTextEditorCaretAtEnd(editor: HTMLElement): void {
    const selection = window.getSelection();
    if (!selection) {
      return;
    }

    const range = document.createRange();
    range.selectNodeContents(editor);
    range.collapse(false);
    selection.removeAllRanges();
    selection.addRange(range);
  }

  private readInlineTextEditorValue(editor: HTMLElement | null): string {
    if (!editor) {
      return '';
    }

    const value = (editor.innerText || editor.textContent || '').replace(/\r\n/g, '\n');
    if (value === '\n') {
      return '';
    }

    return value;
  }

  private startTextEditing(elementId: string): void {
    const element = this.el.findElementById(elementId, this.elements());
    if (element?.type !== 'text') {
      return;
    }

    this.editingTextDraft.set(element.text ?? '');
    this.editingTextElementId.set(elementId);
    this.focusInlineTextEditor(elementId);
  }

  private stopTextEditing(): void {
    this.editingTextElementId.set(null);
    this.editingTextDraft.set('');
  }

  private applyTextEditorDraft(id: string): void {
    const element = this.el.findElementById(id, this.elements());
    if (element?.type !== 'text') {
      return;
    }

    const value = this.editingTextDraft();
    if (value === (element.text ?? '')) {
      return;
    }

    this.updateCurrentPageElements((elements) => {
      let effectivePatch: Partial<CanvasElement> = { text: value };
      const withText = elements.map((currentElement) => {
        if (currentElement.id !== id) return currentElement;
        const updated = { ...currentElement, text: value };
        if (value) {
          const textLayoutPatch = this.buildAutoSizedTextPatch(currentElement, updated);
          if (textLayoutPatch) {
            effectivePatch = { text: value, ...textLayoutPatch };
            return { ...updated, ...textLayoutPatch };
          }
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

  private finalizeTextEditing(id: string | null): boolean {
    if (!id || this.editingTextElementId() !== id) {
      return false;
    }

    this.applyTextEditorDraft(id);
    this.history.commitTextEditHistory(() => this.createHistorySnapshot());
    const removed = this.discardEmptyTextElement(id);
    this.stopTextEditing();
    return removed;
  }

  private measureTextSize(
    element: CanvasElement,
    widthConstraint?: number,
  ): { width: number; height: number } {
    const mirror = document.createElement('div');
    mirror.style.cssText = [
      'position:fixed',
      'top:-9999px',
      'left:-9999px',
      'visibility:hidden',
      'box-sizing:content-box',
      'padding:0',
      'margin:0',
      widthConstraint == null ? 'white-space:pre' : 'white-space:pre-wrap',
      widthConstraint == null ? 'display:inline-block' : 'display:block',
      'overflow-wrap:break-word',
      `font-size:${getTextFontSize(element)}`,
      `font-family:${getTextFontFamily(element)}`,
      `font-weight:${getTextFontWeight(element)}`,
      `font-style:${getTextFontStyle(element)}`,
      `line-height:${getTextLineHeight(element)}`,
      `letter-spacing:${getTextLetterSpacing(element)}`,
    ].join(';');
    if (widthConstraint != null) {
      mirror.style.width = `${widthConstraint}px`;
    }
    // Append a non-breaking space after any trailing newlines so each Enter
    // counts as a real line in the span's layout (trailing \n has no height otherwise).
    const textForMeasure = (element.text || ' ').replace(/\n+$/, (m) => m + '\u200b');
    mirror.textContent = textForMeasure;
    document.body.appendChild(mirror);
    const w = widthConstraint ?? mirror.offsetWidth;
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

    return this.buildAutoSizedTextPatch(previousElement, nextElement);
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
      patch.widthMode !== undefined ||
      patch.heightMode !== undefined ||
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
    this.stopTextEditing();
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
      this.stopTextEditing();
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
