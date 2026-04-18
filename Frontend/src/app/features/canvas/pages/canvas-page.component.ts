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
  PendingProjectFlushService,
  ProjectService,
} from '@app/core';
import { buildCanvasIR, buildCanvasIRPages } from '../mappers/canvas-to-ir.mapper';
import {
  buildCanvasProjectDocument,
  buildPersistedCanvasDesign,
} from '../mappers/canvas-persistence.mapper';
import { HeaderBarComponent, ContextMenuComponent, DialogBoxComponent } from '@app/shared';
import type { ContextMenuItem } from '@app/shared';
import { ToolbarComponent } from '../components/toolbar/toolbar.component';
import { ProjectPanelComponent } from '../components/project-panel/project-panel.component';
import { PropertiesPanelComponent } from '../components/properties-panel/properties-panel.component';
import { mutateNormalizeElement } from '../utils/element/canvas-element-normalization.util';
import { clamp, roundToTwoDecimals } from '../utils/canvas-math.util';
import { collectSubtreeIds, removeWithChildren } from '../utils/canvas-tree.util';
import {
  buildSnapCandidates,
  computeSnappedPosition,
  SNAP_THRESHOLD,
} from '../utils/interaction/canvas-snap.util';
import {
  generateThumbnail,
  generateThumbnailFromCanvas,
} from '../utils/pixi/canvas-thumbnail.util';
import { calculateResizedBounds } from '../utils/interaction/canvas-resize.util';
import {
  getTextFontFamily,
  getTextFontWeight,
  getTextFontStyle,
  getTextFontSize,
  getTextLineHeight,
  getTextLetterSpacing,
  getTextAlignValue,
} from '../utils/element/canvas-text.util';
import { CanvasPersistenceService } from '../services/canvas-persistence.service';
import { CanvasGenerationService } from '../services/canvas-generation.service';
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
  CanvasPageLayout,
  CanvasPageDragState,
  FlowDragRenderState,
} from '../canvas.types';
import { CanvasViewportService } from '../services/canvas-viewport.service';
import { CanvasHistoryService } from '../services/editor/canvas-history.service';
import { CanvasClipboardService } from '../services/editor/canvas-clipboard.service';
import { CanvasElementService } from '../services/canvas-element.service';
import {
  CanvasKeyboardService,
  KeyboardActionCallbacks,
} from '../services/editor/canvas-keyboard.service';
import {
  CanvasContextMenuService,
  ContextMenuActionCallbacks,
} from '../services/editor/canvas-context-menu.service';
import { CanvasEditorStateService } from '../services/canvas-editor-state.service';
import { CanvasPageService } from '../services/canvas-page.service';
import { CanvasPageGeometryService } from '../services/canvas-page-geometry.service';
import { CanvasPixiApplicationService } from '../services/pixi/canvas-pixi-application.service';
import { CanvasPixiRendererService } from '../services/pixi/canvas-pixi-renderer.service';
import { CanvasPixiOverlaysService } from '../services/pixi/canvas-pixi-overlays.service';
import { CanvasPixiGridService } from '../services/pixi/canvas-pixi-grid.service';
import { CanvasPixiPageShellService } from '../services/pixi/canvas-pixi-page-shell.service';
import { CanvasPixiLayoutService } from '../services/pixi/canvas-pixi-layout.service';
import { CanvasGestureService } from '../services/editor/canvas-gesture.service';

const ROOT_FRAME_INSERT_GAP = 48;
const ELEMENT_DRAG_START_THRESHOLD = 3;
const CONTAINER_DROP_TOLERANCE = 4;
const DEFAULT_PROJECT_PANEL_WIDTH = 280;
const PERSIST_FLUSH_POLL_MS = 50;
const PERSIST_FLUSH_MAX_WAIT_MS = 4000;

type RectangleDrawTool = 'rectangle' | 'image';

interface RectangleDrawState {
  tool: RectangleDrawTool;
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
    CanvasGestureService,
  ],
  templateUrl: './canvas-page.component.html',
  styleUrl: './canvas-page.component.css',
})
export class CanvasPage implements OnDestroy, AfterViewChecked {
  private readonly route = inject(ActivatedRoute);
  private readonly canvasPersistenceService = inject(CanvasPersistenceService);
  private readonly projectService = inject(ProjectService);
  readonly generation = inject(CanvasGenerationService);
  private readonly zone = inject(NgZone);

  readonly viewport = inject(CanvasViewportService);
  private readonly history = inject(CanvasHistoryService);
  private readonly clipboard = inject(CanvasClipboardService);
  readonly element = inject(CanvasElementService);
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
  private readonly pendingProjectFlush = inject(PendingProjectFlushService);
  readonly gesture = inject(CanvasGestureService);
  private readonly pixiSceneReady = signal(false);
  private pixiInitPending = false;

  @ViewChild('canvasScene', { static: false }) canvasSceneRef?: ElementRef<HTMLElement>;

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
      this.element.isElementEffectivelyVisible(element.id, this.elements()),
    ),
  );

  readonly currentPageName = computed(() => this.currentPage()?.name ?? 'Untitled page');
  readonly projectPanelWidth = signal(DEFAULT_PROJECT_PANEL_WIDTH);

  // ── API / Generation State ────────────────────────────────

  readonly apiError = this.page.apiError;
  readonly isLoadingDesign = signal(false);
  readonly isSavingDesign = signal(false);
  readonly lastSavedAt = signal<string | null>(null);

  readonly irPreview = computed<IRNode>(() => {
    const currentPage = this.currentPage();
    return buildCanvasIR(this.visibleElements(), this.projectSlug, currentPage?.name);
  });

  readonly irPages = computed<ConverterPageRequest[]>(() =>
    buildCanvasIRPages(this.pages(), this.projectSlug),
  );

  readonly projectSlug = this.route.snapshot.paramMap.get('slug') ?? 'new-project';

  // ── Persistence State ─────────────────────────────────────

  projectIdAsNumber = NaN;
  private canPersistDesign = false;
  private saveTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private hasQueuedDesignPersist = false;
  private hasTriggeredBrowserExitFlush = false;
  private lastPersistedThumbnailDataUrl: string | null = null;
  private pendingThumbnailDataUrl: string | null = null;
  private pendingInitialPageFocusId: string | null = null;
  private suppressNextWindowMenuClose = false;

  constructor() {
    this.loadProjectDesign();

    // Wire gesture service to canvas DOM + Pixi scene state
    this.gesture.setCanvasElementGetter(
      () => document.querySelector('.canvas-container') as HTMLElement | null,
    );

    effect(() => {
      this.pages();
      this.currentPageId();

      if (!this.canPersistDesign) {
        return;
      }

      this.scheduleDesignSave();
    });

    // Invalidate gesture service flow bounds cache whenever elements change.
    effect(() => {
      this.elements();
      this.gesture.invalidateFlowBoundsCache();
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
      if (!this.pixiSceneReady()) return;
      const pages = this.pages();
      const currentPageId = this.currentPageId();
      const layouts = this.page.pageLayouts();
      const editingTextId = this.editingTextElementId();
      const zoom = this.viewport.zoomLevel();
      const selectedPageId = this.page.selectedCanvasPageId();
      const selectedElementIds = this.selectedElementIds();
      const isElementDragging = this.gesture.isDraggingEl();
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
      const draggingId = this.gesture.draggingFlowChildId();
      const ghostBounds = this.gesture.flowDragPlaceholder();
      const dropTarget = this.gesture.layoutDropTarget();
      const isFlowDragInsideContainer = !!dropTarget;
      const flowDragState: FlowDragRenderState | null =
        isElementDragging && draggingId && ghostBounds
          ? {
              draggingElementId: draggingId,
              floatingBounds: ghostBounds.bounds,
              placeholder:
                isFlowDragInsideContainer && dropTarget
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
      if (!this.pixiSceneReady()) return;
      const selected = this.selectedElement();
      const elements = this.elements();
      const zoom = this.viewport.zoomLevel();
      const layout = this.page.activePageLayout();
      const isDragging = this.gesture.isDraggingEl();
      const editingText = this.editingTextElementId();
      const selectedElements = this.selectedElements();

      if (isDragging || editingText) {
        this.pixiOverlays.drawSelectionOutline(null, elements, zoom, layout, false);
        this.pixiOverlays.drawSyncedSelectionOutlines([], elements, zoom, layout);
        return;
      }

      const showHandles =
        !!selected &&
        selected.type !== 'frame' &&
        selected.type !== 'text' &&
        selected.widthMode !== 'fill' &&
        selected.heightMode !== 'fill';
      this.pixiOverlays.drawSelectionOutline(selected, elements, zoom, layout, showHandles);
      this.pixiOverlays.drawSyncedSelectionOutlines(
        this.getSyncedSelectionHighlightElements(selectedElements, elements),
        elements,
        zoom,
        layout,
      );

      // Multi-selection outlines
      if (selectedElements.length > 1) {
        this.pixiOverlays.drawMultiSelectionOutlines(selectedElements, elements, zoom, layout);
      }
    });

    // Sync hover outline
    effect(() => {
      if (!this.pixiSceneReady()) return;
      const hoveredId = this.gesture.hoveredElementId();
      const zoom = this.viewport.zoomLevel();
      const isDragging = this.gesture.isDraggingEl();
      const selectedIds = this.selectedElementIds();

      if (!hoveredId || isDragging || selectedIds.includes(hoveredId)) {
        this.pixiOverlays.drawHoverOutline(
          null,
          this.elements(),
          zoom,
          this.page.activePageLayout(),
        );
        return;
      }

      const hoveredPageId = this.findPageIdByElementId(hoveredId);
      if (!hoveredPageId) {
        this.pixiOverlays.drawHoverOutline(
          null,
          this.elements(),
          zoom,
          this.page.activePageLayout(),
        );
        return;
      }

      const hoveredElements = this.getPageElementsById(hoveredPageId);
      const hoveredLayout = this.page.getPageLayoutById(hoveredPageId);
      const hovered = this.element.findElementById(hoveredId, hoveredElements);
      if (!hoveredLayout || hovered?.type === 'frame') {
        this.pixiOverlays.drawHoverOutline(null, hoveredElements, zoom, hoveredLayout);
        return;
      }

      this.pixiOverlays.drawHoverOutline(hovered, hoveredElements, zoom, hoveredLayout);
    });

    // Sync snap lines
    effect(() => {
      if (!this.pixiSceneReady()) return;
      const lines = this.gesture.snapLines();
      const zoom = this.viewport.zoomLevel();
      const layout = this.page.activePageLayout();
      this.pixiOverlays.drawSnapLines(lines, zoom, layout);
    });

    // Sync rectangle draw preview
    effect(() => {
      if (!this.pixiSceneReady()) return;
      const preview = this.gesture.rectangleDrawPreview();
      const layout = this.page.activePageLayout();
      this.pixiOverlays.drawRectanglePreview(preview, layout);
    });

    // Sync page shell selection outline
    effect(() => {
      if (!this.pixiSceneReady()) return;
      const isDragging = this.gesture.isDraggingEl();
      const zoom = this.viewport.zoomLevel();

      void isDragging;
      void zoom;
      this.pixiOverlays.drawPageShellSelectionOutline(null, 1);
    });
  }

  ngAfterViewChecked(): void {
    this.page.setCanvasElement(this.getCanvasElement());
    this.restorePendingInitialPageFocus();

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
            this.zone.run(() => {
              this.pixiSceneReady.set(true);
              this.gesture.setPixiSceneReady(true);
            });
          });
        });
      }
    }

    this.zone.runOutsideAngular(() => {
      if (this.gesture.isFlowBoundsDirty()) {
        this.gesture.updateFlowBoundsCache(this.canvasSceneRef?.nativeElement ?? null);
        this.gesture.markFlowBoundsCacheClean();
      }
    });
  }

  ngOnDestroy(): void {
    this.pixiSceneReady.set(false);
    this.gesture.setPixiSceneReady(false);

    // Cleanup PixiJS
    this.pixiRenderer.destroy();
    this.pixiOverlays.destroy();
    this.pixiGrid.destroy();
    this.pixiPageShells.destroy();
    this.pixiLayout.destroy();
  }

  async flushPendingPersistence(): Promise<boolean> {
    if (!Number.isInteger(this.projectIdAsNumber)) {
      return true;
    }

    if (this.saveTimeoutId) {
      clearTimeout(this.saveTimeoutId);
      this.saveTimeoutId = null;
      this.persistDesign();
    }

    const deadline = Date.now() + PERSIST_FLUSH_MAX_WAIT_MS;
    while (Date.now() < deadline) {
      if (this.saveTimeoutId) {
        clearTimeout(this.saveTimeoutId);
        this.saveTimeoutId = null;
        this.persistDesign();
      }

      if (!this.isSavingDesign() && !this.hasQueuedDesignPersist) {
        break;
      }

      await new Promise<void>((resolve) => {
        setTimeout(resolve, PERSIST_FLUSH_POLL_MS);
      });
    }

    if (!this.pendingThumbnailDataUrl) {
      this.persistThumbnailIfDue();
    }

    while (Date.now() < deadline) {
      if (!this.pendingThumbnailDataUrl) {
        return true;
      }

      await new Promise<void>((resolve) => {
        setTimeout(resolve, PERSIST_FLUSH_POLL_MS);
      });
    }

    return true;
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
    this.currentTool.set(tool);
    if (tool !== 'image') {
      this.gesture.autoOpenFillPopupElementId.set(null);
    }
    if (tool === 'select') {
      return;
    }

    const selected = this.selectedElement();
    const shouldKeepSelection = tool !== 'frame' && this.element.isContainerElement(selected);
    if (!shouldKeepSelection) {
      this.selectedElementId.set(null);
    }
  }

  // ── Page Management (gesture-coupled handlers stay here) ──

  onActivePageShellClick(pageId: string): void {
    if (this.gesture.consumePageShellClickSuppression()) {
      return;
    }

    this.page.onActivePageShellClick(pageId);
  }

  onInactivePageShellClick(pageId: string): void {
    if (this.gesture.consumePageShellClickSuppression()) {
      return;
    }

    this.page.selectPage(pageId);
  }

  private selectPageFromToolbar(pageId: string): void {
    this.gesture.setSuppressNextCanvasClick(true);

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

    this.gesture.beginPageDrag(event, pageId, layout);
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
      if (this.gesture.beginRectangleDraw(event, true)) {
        return;
      }

      const tool = this.currentTool();
      if (tool !== 'select') {
        const pointer = this.gesture.getActivePageCanvasPoint(event);
        if (!pointer) {
          return;
        }

        event.preventDefault();
        event.stopPropagation();
        this.gesture.setSuppressNextPageShellClick(true);
        this.page.clearSelectedPageLayer();
        this.page.layersFocusedPageId.set(pageId);
        this.gesture.createElementAtCanvasPoint(tool, pointer);
        return;
      }
    }

    const layout = this.page.getPageLayoutById(pageId);
    if (!layout) {
      return;
    }

    this.gesture.beginPageDrag(event, pageId, layout);
  }

  private startPageDrag(event: MouseEvent, pageId: string, layout: CanvasPageLayout): void {
    this.gesture.beginPageDrag(event, pageId, layout);
  }

  // ── Canvas Events ─────────────────────────────────────────

  onCanvasPointerDown(event: MouseEvent): void {
    const target = event.target as HTMLElement;
    if (this.isCanvasBackgroundTarget(target)) {
      this.page.clearSelectedPageLayer();
      this.page.layersFocusedPageId.set(null);
    }
    if (!this.shouldStartPanning(event, target)) {
      if (this.gesture.beginRectangleDraw(event)) {
        return;
      }

      return;
    }

    this.viewport.startPanning(event);
    this.gesture.cancelDragState();
  }

  onCanvasClick(event: MouseEvent): void {
    if (this.gesture.consumeCanvasClickSuppression()) {
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
          this.gesture.finalizeTextEditing(editingId);
        }
        this.page.clearSelectedPageLayer();
        this.clearElementSelection();
        this.page.layersFocusedPageId.set(null);
      }
      return;
    }

    this.page.clearSelectedPageLayer();
    this.page.layersFocusedPageId.set(this.currentPageId());

    const pointer = this.gesture.getActivePageCanvasPoint(event);
    if (!pointer) {
      return;
    }

    const newElement = this.gesture.createElementAtCanvasPoint(tool, pointer);
    if (!newElement) {
      return;
    }
  }

  // ── Element Events ────────────────────────────────────────

  onElementPointerDown(event: MouseEvent, id: string): void {
    const target = event.target as HTMLElement;
    this.gesture.flowDragPlaceholder.set(null);
    this.gesture.setSuppressNextCanvasClick(true);

    if (this.shouldStartPanning(event, target)) {
      this.viewport.startPanning(event);
      this.gesture.cancelDragState();
      return;
    }

    if (this.gesture.beginRectangleDraw(event)) {
      return;
    }

    if (this.editingTextElementId() === id) {
      return;
    }

    // Exit text editing if clicking a different element
    const editingId = this.editingTextElementId();
    if (editingId && editingId !== id) {
      this.gesture.finalizeTextEditing(editingId);
    }

    if (!this.activateElementPageContext(id)) {
      return;
    }

    const elementForTypeCheck = this.element.findElementById(id, this.elements());

    if (event.shiftKey && this.currentTool() === 'select') {
      event.preventDefault();
      event.stopPropagation();
      this.toggleElementSelection(id);
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const tool = this.currentTool();
    if (tool !== 'select') {
      const clickedElement =
        elementForTypeCheck ?? this.element.findElementById(id, this.elements());
      const pointer = this.gesture.getActivePageCanvasPoint(event);
      if (!pointer) {
        return;
      }

      const targetContainer =
        clickedElement && this.element.isContainerElement(clickedElement)
          ? clickedElement
          : this.gesture.resolveInsertionContext(pointer).container;
      const containerBounds = targetContainer
        ? this.element.getAbsoluteBounds(targetContainer, this.elements(), this.currentPage())
        : null;

      this.gesture.createElementAtCanvasPoint(tool, pointer, targetContainer, containerBounds);
      return;
    }

    if (!this.isElementSelected(id)) {
      this.selectOnlyElement(id);
    } else {
      this.selectedElementId.set(id);
    }

    const element = elementForTypeCheck ?? this.element.findElementById(id, this.elements());
    if (!element) {
      return;
    }

    if (this.gesture.isRootFrame(element) && this.gesture.getRootFrameCount(this.elements()) <= 1) {
      return;
    }

    const pointer = this.gesture.getActivePageCanvasPoint(event);
    if (!pointer) {
      return;
    }

    let bounds = this.element.getAbsoluteBounds(element, this.elements(), this.currentPage());
    this.gesture.captureDragSelection(id);
    const isGroupDrag = this.gesture.getDragSelectionCount() > 1;

    // Detect flow child inside layout container — use visual position from cache
    const parent = this.element.findElementById(element.parentId ?? null, this.elements());
    if (
      !isGroupDrag &&
      parent &&
      this.gesture.isLayoutContainer(parent) &&
      this.gesture.isChildInFlow(element)
    ) {
      bounds = this.gesture.beginFlowChildDrag(element, parent, this.elements()) ?? bounds;
    }

    this.gesture.primeElementDrag(pointer, bounds, id);
  }

  onElementDoubleClick(event: MouseEvent, id: string): void {
    event.stopPropagation();

    if (!this.activateElementPageContext(id)) {
      return;
    }

    const element = this.element.findElementById(id, this.elements());
    if (element?.type !== 'text') {
      return;
    }

    this.selectOnlyElement(id);
    this.gesture.beginTextEdit(id);
  }

  onTextEditorPointerDown(event: MouseEvent): void {
    event.stopPropagation();
  }

  onTextEditorInput(id: string, event: Event): void {
    const rawValue = this.gesture.readInlineTextEditorValue(event.target as HTMLElement | null);
    this.gesture.applyTextEditorDraftFromInput(id, rawValue);
  }

  onTextEditorBlur(id: string): void {
    this.gesture.finalizeTextEditing(id);
  }

  onTextEditorKeyDown(event: KeyboardEvent, id: string): void {
    event.stopPropagation();
    if (event.key !== 'Escape') {
      return;
    }
    event.preventDefault();
    const removed = this.gesture.finalizeTextEditing(id);
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
      const pointer = this.gesture.getActivePageCanvasPoint(event);
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
    this.gesture.setSuppressNextCanvasClick(true);
    this.selectOnlyElement(id);
    this.gesture.beginResize(event, id, handle);
  }

  onCornerZonePointerDown(event: MouseEvent, id: string, _corner: CornerHandle): void {
    event.stopPropagation();
    event.preventDefault();
    this.selectOnlyElement(id);
    this.gesture.beginRotate(event, id, _corner);
  }

  onCornerRadiusHandlePointerDown(event: MouseEvent, id: string): void {
    event.stopPropagation();
    event.preventDefault();
    this.gesture.setSuppressNextCanvasClick(true);
    this.selectOnlyElement(id);
    this.gesture.beginCornerRadius(event, id);
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

          if (this.gesture.didContainerLayoutStateChange(element, nextElement)) {
            layoutTransitionContainerIds = [element.id];
          }

          const textLayoutPatch = this.gesture.getAutoSizedTextLayoutPatch(
            element,
            nextElement,
            patch,
          );
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
          return this.gesture.applyLayoutTransitionsForContainers(
            elements,
            detached,
            layoutTransitionContainerIds,
          );
        }

        const synced = this.gesture.syncElementPatchToPrimary(
          selectedId,
          effectivePatch,
          withPatch,
        );
        if (layoutTransitionContainerIds.length === 0) {
          return synced;
        }

        const syncedContainerIds = synced
          .filter((element) => element.primarySyncId === selectedId)
          .map((element) => element.id);

        return this.gesture.applyLayoutTransitionsForContainers(elements, synced, [
          ...layoutTransitionContainerIds,
          ...syncedContainerIds,
        ]);
      });
    };

    if (this.gesture.isInPropertyNumberGesture()) {
      applyPatch();
      return;
    }

    this.gesture.runWithHistory(() => {
      applyPatch();
    });
  }

  onProjectPanelWidthChanged(width: number): void {
    this.projectPanelWidth.set(width);
  }

  onPropertyNumberGestureStarted(): void {
    this.gesture.beginPropertyNumberGesture();
  }

  onPropertyNumberGestureCommitted(): void {
    this.gesture.commitPropertyNumberGesture();
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
    this.gesture.runWithHistory(() => {
      this.updatePageElements(change.pageId, (elements) => {
        const updated = elements.map((element) =>
          element.id === change.id ? { ...element, name: change.name } : element,
        );
        const updatedEl = updated.find((e) => e.id === change.id);
        if (updatedEl?.primarySyncId) {
          return updated.map((e) => (e.id === change.id ? { ...e, primarySyncId: undefined } : e));
        }
        return this.gesture.syncElementPatchToPrimary(change.id, { name: change.name }, updated);
      });
    });
  }

  onLayerVisibilityToggled(change: { pageId: string; id: string }): void {
    this.gesture.runWithHistory(() => {
      this.updatePageElements(change.pageId, (elements) => {
        const el = elements.find((e) => e.id === change.id);
        const newVisible = el?.visible === false;
        const updated = elements.map((element) =>
          element.id === change.id ? { ...element, visible: element.visible === false } : element,
        );
        if (el?.primarySyncId) {
          return updated.map((e) => (e.id === change.id ? { ...e, primarySyncId: undefined } : e));
        }
        return this.gesture.syncElementPatchToPrimary(change.id, { visible: newVisible }, updated);
      });
    });
  }

  onLayerMoved(change: {
    pageId: string;
    draggedId: string;
    targetId: string | null;
    position: 'before' | 'after' | 'inside';
  }): void {
    this.gesture.runWithHistory(() => {
      this.updatePageElements(change.pageId, (elements) => {
        const dragged = this.element.findElementById(change.draggedId, elements);
        const draggedBounds = dragged
          ? (this.gesture.getLiveElementCanvasBounds(dragged) ??
            this.element.getAbsoluteBounds(dragged, elements, this.currentPage()))
          : null;
        const reordered = this.element.reorderLayerElements(
          elements,
          change.draggedId,
          change.targetId,
          change.position,
        );

        if (!draggedBounds) {
          return reordered;
        }

        return this.gesture.normalizeDraggedElementAfterLayerMove(
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
    const frame = this.element.createFrameAtCenter(
      {
        x: centerPoint.x - pageOffset.x,
        y: centerPoint.y - pageOffset.y,
      },
      template.width,
      template.height,
      template.name,
      this.elements(),
    );

    this.gesture.runWithHistory(() => {
      this.updateCurrentPageElements((elements) => {
        const withFrame = [...elements, frame];
        const primaryFrame = this.gesture.getPrimaryFrameFromElements(withFrame);
        return primaryFrame
          ? this.gesture.syncPrimarySubtreeAcrossFrames(primaryFrame.id, withFrame)
          : withFrame;
      });
      this.selectOnlyElement(frame.id);
      this.currentTool.set('select');
    });

    const bounds = this.element.getAbsoluteBounds(frame, [...this.elements()], this.currentPage());
    this.viewport.focusElement(frame, bounds, this.getCanvasElement());
  }

  setFramework(framework: SupportedFramework): void {
    this.generation.setFramework(framework);
  }

  // ── Context Menu ──────────────────────────────────────────

  onCanvasContextMenu(event: MouseEvent): void {
    event.preventDefault();
    this.contextMenu.open(event.clientX, event.clientY, this.buildContextMenuCallbacks());
  }

  onElementContextMenu(event: MouseEvent, id: string): void {
    event.preventDefault();
    event.stopPropagation();

    if (!this.activateElementPageContext(id)) {
      return;
    }

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

    this.gesture.handlePointerMove(event);
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
    this.gesture.handlePointerUp(event);
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

  private activateElementPageContext(elementId: string): boolean {
    const targetPageId = this.findPageIdByElementId(elementId);
    if (!targetPageId) {
      return false;
    }

    const shouldPreserveAllPagesView = this.page.layersFocusedPageId() === null;
    if (targetPageId !== this.currentPageId()) {
      this.currentPageId.set(targetPageId);
    }

    this.page.clearSelectedPageLayer();
    if (!shouldPreserveAllPagesView) {
      this.page.layersFocusedPageId.set(targetPageId);
    }

    return true;
  }

  private findPageIdByElementId(elementId: string): string | null {
    const pages = this.pages();
    for (const page of pages) {
      if (page.elements.some((element) => element.id === elementId)) {
        return page.id;
      }
    }

    return null;
  }

  private getPageElementsById(pageId: string): CanvasElement[] {
    return this.pages().find((page) => page.id === pageId)?.elements ?? [];
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

  private getSyncedSelectionHighlightElements(
    selectedElements: CanvasElement[],
    elements: CanvasElement[],
  ): CanvasElement[] {
    if (selectedElements.length === 0) {
      return [];
    }

    const selectedIds = new Set(selectedElements.map((element) => element.id));
    const syncedSourceIds = new Set(
      elements
        .map((element) => element.primarySyncId)
        .filter((primarySyncId): primarySyncId is string => typeof primarySyncId === 'string'),
    );
    const highlightSourceIds = new Set<string>();

    for (const selectedElement of selectedElements) {
      if (selectedElement.primarySyncId) {
        highlightSourceIds.add(selectedElement.primarySyncId);
        continue;
      }

      if (syncedSourceIds.has(selectedElement.id)) {
        highlightSourceIds.add(selectedElement.id);
      }
    }

    if (highlightSourceIds.size === 0) {
      return [];
    }

    return elements.filter(
      (element) =>
        !selectedIds.has(element.id) &&
        (highlightSourceIds.has(element.id) ||
          (!!element.primarySyncId && highlightSourceIds.has(element.primarySyncId))),
    );
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

  private isRootFrame(element: CanvasElement): boolean {
    return this.gesture.isRootFrame(element);
  }

  private isLayoutContainer(element: CanvasElement | null): boolean {
    return this.gesture.isLayoutContainer(element);
  }

  private isChildInFlow(element: CanvasElement): boolean {
    return this.gesture.isChildInFlow(element);
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

  private getLiveOverlaySceneBounds(element: CanvasElement): Bounds | null {
    return this.getLivePixiSceneBounds(element);
  }

  private getLivePixiSceneBounds(element: CanvasElement): Bounds | null {
    if (!this.pixiSceneReady()) {
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
    const absoluteBounds = this.element.getAbsoluteBounds(
      element,
      this.elements(),
      this.currentPage(),
    );

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
    const livePixiBounds = this.getLivePixiSceneBounds(element);
    if (livePixiBounds) {
      return livePixiBounds;
    }

    const layout = this.page.activePageLayout();
    const absolute = this.element.getAbsoluteBounds(element, this.elements(), this.currentPage());
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
    return this.element.findElementById(id, this.elements()) ?? null;
  }

  private getTextEditorDisplayBounds(): Bounds | null {
    const el = this.getTextEditorElement();
    if (!el) return null;

    const bounds =
      this.getLiveElementCanvasBounds(el) ?? this.element.getAbsoluteBounds(el, this.elements());
    const draft = this.gesture.editingTextDraft();
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
    const previousRenderedWidth = this.element.getRenderedWidth(
      previousElement,
      this.elements(),
      this.currentPage(),
    );
    const widthConstraint = this.canAutoSizeTextAxis(previousElement, 'width')
      ? undefined
      : previousRenderedWidth;
    const size = this.measureTextSize(nextElement, widthConstraint);
    const patch: Partial<CanvasElement> = {};

    if (this.canAutoSizeTextAxis(previousElement, 'width')) {
      const centerX = previousElement.x + previousRenderedWidth / 2;
      patch.x = roundToTwoDecimals(centerX - size.width / 2);
      patch.width = size.width;
    }

    if (this.canAutoSizeTextAxis(previousElement, 'height')) {
      patch.height = size.height;
    }

    return Object.keys(patch).length > 0 ? patch : null;
  }

  private getElementPaddingAxisTotal(element: CanvasElement, axis: 'width' | 'height'): number {
    if (!element.padding) {
      return 0;
    }

    return axis === 'width'
      ? element.padding.left + element.padding.right
      : element.padding.top + element.padding.bottom;
  }

  private getStoredAxisSizeFromRendered(
    element: CanvasElement,
    axis: 'width' | 'height',
    renderedSize: number,
  ): number {
    return Math.max(
      24,
      roundToTwoDecimals(renderedSize - this.getElementPaddingAxisTotal(element, axis)),
    );
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
      cursorX +=
        this.element.getRenderedWidth(frame, elements, this.currentPage()) + ROOT_FRAME_INSERT_GAP;
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
    this.gesture.cancelDragState();
    this.history.commitGestureHistory(() => this.createHistorySnapshot());
    this.finalizeTextEditing(this.editingTextElementId());
  }

  @HostListener('window:beforeunload')
  handleBeforeUnload(): void {
    this.dispatchBrowserExitFlush();
  }

  @HostListener('window:pagehide', ['$event'])
  handlePageHide(event: PageTransitionEvent): void {
    if (event.persisted) {
      return;
    }

    this.dispatchBrowserExitFlush();
  }

  // ── Code Generation ───────────────────────────────────────

  validateIR(): void {
    this.apiError.set(null);
    this.generation.validate(this.irPages());
  }

  generateCode(): void {
    this.pendingProjectFlush.clearPendingFlush(this.projectIdAsNumber);
    this.apiError.set(null);
    this.generation.generate(this.irPages());
  }

  // ── Private: Persistence ──────────────────────────────────

  private loadProjectDesign(): void {
    if (!this.projectSlug || this.projectSlug === 'new-project') {
      this.apiError.set('Invalid project.');
      return;
    }

    this.isLoadingDesign.set(true);
    this.apiError.set(null);
    this.canPersistDesign = false;

    this.projectService.getBySlug(this.projectSlug).subscribe({
      next: (project) => {
        this.projectIdAsNumber = project.projectId;
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
            this.page.clearSelectedPageLayer();
            this.page.layersFocusedPageId.set(activePageId);
            this.pendingInitialPageFocusId = activePageId;
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
      },
      error: (error: { error?: { message?: string; title?: string; detail?: string } }) => {
        this.apiError.set(extractApiErrorMessage(error, 'Project not found.'));
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
      this.saveTimeoutId = null;
      this.persistDesign();
    }, 500);
  }

  private restorePendingInitialPageFocus(): void {
    const pageId = this.pendingInitialPageFocusId;
    if (!pageId) {
      return;
    }

    const canvasElement = this.getCanvasElement();
    if (!canvasElement) {
      return;
    }

    if (!this.pages().some((page) => page.id === pageId)) {
      this.pendingInitialPageFocusId = null;
      return;
    }

    this.page.focusPageSmooth(pageId, canvasElement);
    this.pendingInitialPageFocusId = null;
  }

  private persistDesign(): void {
    if (!Number.isInteger(this.projectIdAsNumber)) {
      return;
    }

    if (this.isSavingDesign()) {
      this.hasQueuedDesignPersist = true;
      return;
    }

    if (this.saveTimeoutId) {
      clearTimeout(this.saveTimeoutId);
      this.saveTimeoutId = null;
    }

    const document = this.buildCurrentProjectDocument();
    this.hasQueuedDesignPersist = false;
    this.isSavingDesign.set(true);

    this.canvasPersistenceService.saveProjectDesign(this.projectIdAsNumber, document).subscribe({
      next: (response) => {
        this.lastSavedAt.set(response.updatedAt ?? null);
        this.finishPersistDesign();
      },
      error: (error: { error?: { message?: string; title?: string; detail?: string } }) => {
        this.apiError.set(extractApiErrorMessage(error, 'Failed to save project design.'));
        this.finishPersistDesign();
      },
    });
  }

  private finishPersistDesign(): void {
    this.isSavingDesign.set(false);

    if (!this.hasQueuedDesignPersist) {
      return;
    }

    this.hasQueuedDesignPersist = false;
    this.persistDesign();
  }

  private persistThumbnailIfDue(precomputedThumbnail?: string | null): void {
    if (!Number.isInteger(this.projectIdAsNumber)) {
      return;
    }

    const thumbnail =
      precomputedThumbnail !== undefined
        ? precomputedThumbnail
        : (this.captureRenderedThumbnail() ?? generateThumbnail(this.currentPage()));
    if (!thumbnail) {
      return;
    }

    if (
      thumbnail === this.lastPersistedThumbnailDataUrl ||
      thumbnail === this.pendingThumbnailDataUrl
    ) {
      return;
    }

    const thumbnailFile = this.createThumbnailBlob(thumbnail);
    if (!thumbnailFile) {
      return;
    }

    this.pendingThumbnailDataUrl = thumbnail;

    this.canvasPersistenceService
      .saveProjectThumbnail(this.projectIdAsNumber, thumbnailFile)
      .subscribe({
        next: () => {
          if (this.pendingThumbnailDataUrl === thumbnail) {
            this.pendingThumbnailDataUrl = null;
          }
          this.lastPersistedThumbnailDataUrl = thumbnail;
        },
        error: (error: { error?: { message?: string; title?: string; detail?: string } }) => {
          if (this.pendingThumbnailDataUrl === thumbnail) {
            this.pendingThumbnailDataUrl = null;
          }
          this.apiError.set(extractApiErrorMessage(error, 'Failed to save project thumbnail.'));
        },
      });
  }

  private dispatchBrowserExitFlush(): void {
    if (this.hasTriggeredBrowserExitFlush || !Number.isInteger(this.projectIdAsNumber)) {
      return;
    }

    this.pendingProjectFlush.queueAndDispatch(
      this.projectIdAsNumber,
      this.buildCurrentPersistedDesignJson(),
      this.captureRenderedThumbnail() ?? generateThumbnail(this.currentPage()),
    );
    this.hasTriggeredBrowserExitFlush = true;
  }

  private buildCurrentProjectDocument() {
    return buildCanvasProjectDocument(this.pages(), this.projectSlug, this.currentPageId());
  }

  private buildCurrentPersistedDesignJson(): string {
    return JSON.stringify(buildPersistedCanvasDesign(this.buildCurrentProjectDocument()));
  }

  private createThumbnailBlob(thumbnailDataUrl: string): Blob | null {
    const match = /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/i.exec(thumbnailDataUrl.trim());
    if (!match) {
      return null;
    }

    try {
      const contentType = match[1].toLowerCase();
      const base64Data = match[2];
      const binary = atob(base64Data);
      const bytes = new Uint8Array(binary.length);
      for (let index = 0; index < binary.length; index += 1) {
        bytes[index] = binary.charCodeAt(index);
      }

      return new Blob([bytes], { type: contentType });
    } catch {
      return null;
    }
  }

  private captureRenderedThumbnail(): string | null {
    const sourceCanvas = this.pixiApp.canvas;
    const app = this.pixiApp.pixiApp as {
      render?: () => void;
      stage?: unknown;
      renderer?: { render?: (target?: unknown) => void };
    } | null;
    const currentPage = this.currentPage();
    const layout = this.page.activePageLayout();

    if (!sourceCanvas || !app || !layout || !currentPage) {
      return null;
    }

    const targetSceneBounds = this.resolveThumbnailSceneBounds(currentPage, layout);

    const canvasWidth = sourceCanvas.clientWidth || sourceCanvas.width;
    const canvasHeight = sourceCanvas.clientHeight || sourceCanvas.height;
    if (
      canvasWidth <= 0 ||
      canvasHeight <= 0 ||
      targetSceneBounds.width <= 0 ||
      targetSceneBounds.height <= 0
    ) {
      return null;
    }

    const previousOffset = this.viewport.viewportOffset();
    const previousZoom = this.viewport.zoomLevel();
    const previousOverlayVisible = this.pixiApp.overlayContainer.visible;
    const fitPadding = 32;
    const availableWidth = Math.max(1, canvasWidth - fitPadding);
    const availableHeight = Math.max(1, canvasHeight - fitPadding);
    const captureZoom = Math.min(
      availableWidth / targetSceneBounds.width,
      availableHeight / targetSceneBounds.height,
    );
    const captureOffset = {
      x: roundToTwoDecimals(
        (canvasWidth - targetSceneBounds.width * captureZoom) / 2 -
          targetSceneBounds.x * captureZoom,
      ),
      y: roundToTwoDecimals(
        (canvasHeight - targetSceneBounds.height * captureZoom) / 2 -
          targetSceneBounds.y * captureZoom,
      ),
    };

    try {
      this.pixiApp.overlayContainer.visible = false;
      this.pixiGrid.setVisible(false);
      this.pixiApp.syncViewport(captureOffset.x, captureOffset.y, captureZoom);
      this.pixiGrid.syncGrid(captureOffset.x, captureOffset.y, captureZoom);
      this.forcePixiRender(app);

      return generateThumbnailFromCanvas(sourceCanvas, {
        x: captureOffset.x + targetSceneBounds.x * captureZoom,
        y: captureOffset.y + targetSceneBounds.y * captureZoom,
        width: targetSceneBounds.width * captureZoom,
        height: targetSceneBounds.height * captureZoom,
      });
    } finally {
      this.pixiApp.syncViewport(previousOffset.x, previousOffset.y, previousZoom);
      this.pixiGrid.setVisible(true);
      this.pixiGrid.syncGrid(previousOffset.x, previousOffset.y, previousZoom);
      this.pixiApp.overlayContainer.visible = previousOverlayVisible;
      this.forcePixiRender(app);
    }
  }

  private resolveThumbnailSceneBounds(page: CanvasPageModel, layout: CanvasPageLayout): Bounds {
    const primaryFrame = this.getPrimaryFrame(page.elements);
    if (!primaryFrame) {
      return {
        x: layout.x,
        y: layout.y,
        width: layout.width,
        height: layout.height,
      };
    }

    const primaryBounds = this.element.getAbsoluteBounds(primaryFrame, page.elements, page);
    return {
      x: roundToTwoDecimals(layout.x + primaryBounds.x),
      y: roundToTwoDecimals(layout.y + primaryBounds.y),
      width: primaryBounds.width,
      height: primaryBounds.height,
    };
  }

  private forcePixiRender(app: {
    render?: () => void;
    stage?: unknown;
    renderer?: { render?: (target?: unknown) => void };
  }): void {
    if (typeof app.render === 'function') {
      app.render();
      return;
    }

    if (typeof app.renderer?.render === 'function') {
      app.renderer.render(app.stage);
    }
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
      this.zone.run(() => this.gesture.hoveredElementId.set(elId));
    });

    sceneContainer.on('pointerout', (e) => {
      const elId = this.pixiRenderer.getElementIdFromTarget(e.target as any);
      if (!elId) return;
      this.zone.run(() => {
        if (this.gesture.hoveredElementId() === elId) {
          this.gesture.hoveredElementId.set(null);
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
        this.page.openPreviewForPage(this.projectSlug, pageId);
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
        this.gesture.setSuppressNextCanvasClick(true);
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
    const live = this.getLiveElementCanvasBounds(element);
    if (live) {
      return live;
    }

    return this.element.getAbsoluteBounds(element, this.elements(), this.currentPage());
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
          position: this.element.getDefaultPositionForPlacement(element.type, nextContainer),
        };
      }

      const previousChild =
        previousElements.find((candidate) => candidate.id === element.id) ?? element;
      const childBounds = this.getFlowAwareBounds(previousChild, previousElements);
      const nextContainerWidth = this.element.getRenderedWidth(
        nextContainer,
        nextElements,
        this.currentPage(),
      );
      const nextContainerHeight = this.element.getRenderedHeight(
        nextContainer,
        nextElements,
        this.currentPage(),
      );
      const childWidth = this.element.getRenderedWidth(element, nextElements, this.currentPage());
      const childHeight = this.element.getRenderedHeight(element, nextElements, this.currentPage());

      return {
        ...element,
        x: roundToTwoDecimals(
          clamp(childBounds.x - previousContainerBounds.x, 0, nextContainerWidth - childWidth),
        ),
        y: roundToTwoDecimals(
          clamp(childBounds.y - previousContainerBounds.y, 0, nextContainerHeight - childHeight),
        ),
        position: this.element.getDefaultPositionForPlacement(element.type, nextContainer),
      };
    });
  }

  private getFlowAwareBounds(element: CanvasElement, elements: CanvasElement[]): Bounds {
    // Prefer live Pixi-computed position (reflects Yoga layout for flow children).
    // The DOM flow-cache is never populated in Pixi-only rendering, so skip it.
    const live = this.getLiveElementCanvasBounds(element);
    if (live) {
      return live;
    }

    return this.element.getAbsoluteBounds(element, elements, this.currentPage());
  }

  private normalizeDraggedElementAfterLayerMove(
    previousElements: CanvasElement[],
    nextElements: CanvasElement[],
    draggedId: string,
    previousBounds: Bounds,
  ): CanvasElement[] {
    const dragged = this.element.findElementById(draggedId, nextElements);
    if (!dragged) {
      return nextElements;
    }

    const nextParent = this.element.findElementById(dragged.parentId ?? null, nextElements);
    const nextPosition = this.element.getDefaultPositionForPlacement(dragged.type, nextParent);

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

    const previousParent =
      this.element.findElementById(nextParent.id, previousElements) ?? nextParent;
    const parentBounds =
      this.getLiveElementCanvasBounds(previousParent) ??
      this.getFlowAwareBounds(previousParent, previousElements);
    const nextParentWidth = this.element.getRenderedWidth(
      nextParent,
      nextElements,
      this.currentPage(),
    );
    const nextParentHeight = this.element.getRenderedHeight(
      nextParent,
      nextElements,
      this.currentPage(),
    );
    const draggedWidth = this.element.getRenderedWidth(dragged, nextElements, this.currentPage());
    const draggedHeight = this.element.getRenderedHeight(dragged, nextElements, this.currentPage());
    const maxX = Math.max(0, nextParentWidth - draggedWidth);
    const maxY = Math.max(0, nextParentHeight - draggedHeight);

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
      const parent = this.element.findElementById(currentParentId, elements);
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
        !this.element.isContainerElement(element) ||
        !this.element.isElementEffectivelyVisible(element.id, elements)
      ) {
        return false;
      }

      const bounds = this.element.getAbsoluteBounds(element, elements, this.currentPage());
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

    const selectedContainer = this.element.getSelectedContainer(this.selectedElement());
    return selectedContainer && this.canContainerFitSize(selectedContainer, requiredSize)
      ? selectedContainer
      : null;
  }

  private resolveInsertionContainerForBounds(
    bounds: Bounds,
    excludedRootId?: string | null,
  ): CanvasElement | null {
    const elements = this.elements();
    const excludedIds = excludedRootId
      ? new Set(collectSubtreeIds(elements, excludedRootId))
      : null;
    const hoveredContainers = elements.filter((element) => {
      if (
        !this.element.isContainerElement(element) ||
        !this.element.isElementEffectivelyVisible(element.id, elements) ||
        excludedIds?.has(element.id)
      ) {
        return false;
      }

      const containerBounds = this.element.getAbsoluteBounds(element, elements, this.currentPage());
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
        ? this.element.getAbsoluteBounds(container, this.elements(), this.currentPage())
        : null,
    };
  }

  private getSmallestContainer(containers: CanvasElement[]): CanvasElement | null {
    if (containers.length === 0) {
      return null;
    }

    return containers.reduce((best, candidate) => {
      const bestArea =
        this.element.getRenderedWidth(best, this.elements(), this.currentPage()) *
        this.element.getRenderedHeight(best, this.elements(), this.currentPage());
      const candidateArea =
        this.element.getRenderedWidth(candidate, this.elements(), this.currentPage()) *
        this.element.getRenderedHeight(candidate, this.elements(), this.currentPage());
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

    return (
      this.element.getRenderedWidth(container, this.elements(), this.currentPage()) >=
        requiredSize.width &&
      this.element.getRenderedHeight(container, this.elements(), this.currentPage()) >=
        requiredSize.height
    );
  }

  private isBoundsFullyInsideBounds(inner: Bounds, outer: Bounds): boolean {
    return (
      inner.x >= outer.x &&
      inner.y >= outer.y &&
      inner.x + inner.width <= outer.x + outer.width &&
      inner.y + inner.height <= outer.y + outer.height
    );
  }

  private isBoundsInsideBoundsWithTolerance(
    inner: Bounds,
    outer: Bounds,
    tolerance: number,
  ): boolean {
    return (
      inner.x >= outer.x - tolerance &&
      inner.y >= outer.y - tolerance &&
      inner.x + inner.width <= outer.x + outer.width + tolerance &&
      inner.y + inner.height <= outer.y + outer.height + tolerance
    );
  }

  private resolveDraggedElementPatch(
    element: CanvasElement,
    elements: CanvasElement[],
    nextAbsoluteX: number,
    nextAbsoluteY: number,
    preserveParentDuringDrag = false,
  ): Partial<CanvasElement> {
    const parent = this.element.findElementById(element.parentId ?? null, elements);
    if (!parent) {
      return {
        x: roundToTwoDecimals(nextAbsoluteX),
        y: roundToTwoDecimals(nextAbsoluteY),
      };
    }

    const parentBounds = this.element.getAbsoluteBounds(parent, elements, this.currentPage());
    const elementRenderedWidth = this.element.getRenderedWidth(
      element,
      elements,
      this.currentPage(),
    );
    const elementRenderedHeight = this.element.getRenderedHeight(
      element,
      elements,
      this.currentPage(),
    );
    const parentRenderedWidth = this.element.getRenderedWidth(parent, elements, this.currentPage());
    const parentRenderedHeight = this.element.getRenderedHeight(
      parent,
      elements,
      this.currentPage(),
    );
    const nextBounds: Bounds = {
      x: nextAbsoluteX,
      y: nextAbsoluteY,
      width: elementRenderedWidth,
      height: elementRenderedHeight,
    };

    if (
      preserveParentDuringDrag &&
      this.element.isContainerElement(parent) &&
      !this.isLayoutContainer(parent) &&
      element.position === 'absolute'
    ) {
      return {
        x: roundToTwoDecimals(nextAbsoluteX - parentBounds.x),
        y: roundToTwoDecimals(nextAbsoluteY - parentBounds.y),
      };
    }

    if (
      this.element.isContainerElement(parent) &&
      !this.isLayoutContainer(parent) &&
      !this.isBoundsFullyInsideBounds(nextBounds, parentBounds)
    ) {
      return {
        parentId: null,
        position: this.element.getDefaultPositionForPlacement(element.type, null),
        x: roundToTwoDecimals(nextAbsoluteX),
        y: roundToTwoDecimals(nextAbsoluteY),
      };
    }

    return {
      x: clamp(nextAbsoluteX - parentBounds.x, 0, parentRenderedWidth - elementRenderedWidth),
      y: clamp(nextAbsoluteY - parentBounds.y, 0, parentRenderedHeight - elementRenderedHeight),
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
    const requiredSize = this.element.getDefaultElementDimensions(
      tool,
      this.viewport.frameTemplate(),
    );
    const preferredContainer =
      tool === 'frame' ||
      !targetContainer ||
      !this.canContainerFitSize(targetContainer, requiredSize)
        ? null
        : targetContainer;
    const resolvedContainer =
      tool === 'frame'
        ? null
        : (preferredContainer ?? this.resolveInsertionContainer(pointer, requiredSize));
    const resolvedContainerBounds = resolvedContainer
      ? targetContainer && resolvedContainer.id === targetContainer.id
        ? (containerBounds ??
          this.element.getAbsoluteBounds(resolvedContainer, this.elements(), this.currentPage()))
        : this.element.getAbsoluteBounds(resolvedContainer, this.elements(), this.currentPage())
      : null;

    const result = this.element.createElementAtPoint(
      tool,
      pointer,
      this.elements(),
      resolvedContainer,
      resolvedContainerBounds,
      this.viewport.frameTemplate(),
    );

    const newElement = this.commitElementCreationResult(result);
    this.gesture.autoOpenFillPopupElementId.set(
      tool === 'image' && newElement ? newElement.id : null,
    );
    return newElement;
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
        const withNewElement = [...elements, newElement];
        return this.syncPrimarySubtreeAcrossFrames(newElement.id, withNewElement);
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
    const element = this.element.findElementById(id, elements);
    if (!element || element.type === 'frame') return;

    const elementBounds = this.element.getAbsoluteBounds(element, elements, this.currentPage());
    const currentParent = element.parentId
      ? this.element.findElementById(element.parentId, elements)
      : null;

    if (currentParent) {
      const currentParentBounds = this.element.getAbsoluteBounds(
        currentParent,
        elements,
        this.currentPage(),
      );
      const isStillInsideCurrentParent = this.isBoundsInsideBoundsWithTolerance(
        elementBounds,
        currentParentBounds,
        CONTAINER_DROP_TOLERANCE,
      );

      if (isStillInsideCurrentParent) {
        this.updateCurrentPageElements((els) =>
          els.map((el) =>
            el.id === id
              ? {
                  ...el,
                  x: roundToTwoDecimals(
                    clamp(
                      elementBounds.x - currentParentBounds.x,
                      0,
                      this.element.getRenderedWidth(currentParent, els, this.currentPage()) -
                        this.element.getRenderedWidth(el, els, this.currentPage()),
                    ),
                  ),
                  y: roundToTwoDecimals(
                    clamp(
                      elementBounds.y - currentParentBounds.y,
                      0,
                      this.element.getRenderedHeight(currentParent, els, this.currentPage()) -
                        this.element.getRenderedHeight(el, els, this.currentPage()),
                    ),
                  ),
                }
              : el,
          ),
        );
        return;
      }
    }

    const target = this.resolveInsertionContainerForBounds(elementBounds, id);

    if (!target) {
      if (currentParent) {
        this.updateCurrentPageElements((els) =>
          els.map((el) =>
            el.id === id
              ? {
                  ...el,
                  parentId: null,
                  position: this.element.getDefaultPositionForPlacement(el.type, null),
                  x: roundToTwoDecimals(elementBounds.x),
                  y: roundToTwoDecimals(elementBounds.y),
                }
              : el,
          ),
        );
      }

      return;
    }

    if (!target || target.id === element.parentId) return;

    const fb = this.element.getAbsoluteBounds(target, elements, this.currentPage());
    const isTargetLayout = this.isLayoutContainer(target);
    this.updateCurrentPageElements((els) =>
      els.map((el) =>
        el.id === id
          ? {
              ...el,
              parentId: target.id,
              position: this.element.getDefaultPositionForPlacement(el.type, target),
              x: isTargetLayout
                ? 0
                : clamp(
                    elementBounds.x - fb.x,
                    0,
                    this.element.getRenderedWidth(target, els, this.currentPage()) -
                      this.element.getRenderedWidth(el, els, this.currentPage()),
                  ),
              y: isTargetLayout
                ? 0
                : clamp(
                    elementBounds.y - fb.y,
                    0,
                    this.element.getRenderedHeight(target, els, this.currentPage()) -
                      this.element.getRenderedHeight(el, els, this.currentPage()),
                  ),
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

      this.syncInlineTextEditorContent(editor, this.gesture.editingTextDraft());
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
    const element = this.element.findElementById(elementId, this.elements());
    if (element?.type !== 'text') {
      return;
    }

    this.gesture.editingTextDraft.set(element.text ?? '');
    this.editingTextElementId.set(elementId);
    this.focusInlineTextEditor(elementId);
  }

  private stopTextEditing(): void {
    this.editingTextElementId.set(null);
    this.gesture.editingTextDraft.set('');
  }

  private applyTextEditorDraft(id: string): void {
    const element = this.element.findElementById(id, this.elements());
    if (element?.type !== 'text') {
      return;
    }

    const value = this.gesture.editingTextDraft();
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

    const element = this.element.findElementById(id, this.elements());
    if (element?.type !== 'text' || element.text?.trim()) {
      return false;
    }

    this.updateCurrentPageElements((elements) => {
      const withoutElement = removeWithChildren(elements, id);
      return this.removeSyncedCopiesForSourceSubtree(id, withoutElement, elements);
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

    const selectedContainer = this.element.getSelectedContainer(this.selectedElement());
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
      this.updateCurrentPageElements((elements) => {
        let nextElements = [...elements, ...pasted.elements];
        for (const rootId of pasted.rootIds) {
          nextElements = this.syncPrimarySubtreeAcrossFrames(rootId, nextElements);
        }

        return nextElements;
      });
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
          return this.removeSyncedCopiesForSourceSubtree(selectedId, withoutElement, nextElements);
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
      copy: () => this.copySelectedElement(),
      paste: () => this.pasteClipboard(),
      undo: () =>
        this.history.undo(
          () => this.createHistorySnapshot(),
          (snapshot) => this.applyHistorySnapshot(snapshot),
        ),
      redo: () =>
        this.history.redo(
          () => this.createHistorySnapshot(),
          (snapshot) => this.applyHistorySnapshot(snapshot),
        ),
      delete: () => this.deleteSelectedElement(),
      selectTool: (tool) => this.onToolbarToolSelected(tool),
      spaceDown: () => this.viewport.isSpacePressed.set(true),
      spaceUp: () => this.viewport.isSpacePressed.set(false),
      zoomIn: () => this.viewport.zoomIn(this.getCanvasElement()),
      zoomOut: () => this.viewport.zoomOut(this.getCanvasElement()),
    };
  }

  private buildContextMenuCallbacks(): ContextMenuActionCallbacks {
    return {
      copy: () => this.copySelectedElement(),
      paste: () => this.pasteClipboard(),
      delete: (id) => {
        const selectedIds = this.gesture.getSelectionRootIds();
        const targetIds =
          selectedIds.length > 1 && selectedIds.includes(id)
            ? selectedIds
            : this.gesture.getSelectionRootIds([id]);

        this.gesture.runWithHistory(() => {
          this.updateCurrentPageElements((elements) => {
            return targetIds.reduce((nextElements, targetId) => {
              const withoutElement = removeWithChildren(nextElements, targetId);
              return this.gesture.removeSyncedCopiesForSourceSubtree(
                targetId,
                withoutElement,
                nextElements,
              );
            }, elements);
          });
          this.clearElementSelection();
        });
      },
      bringToFront: (id) => this.bringToFront(id),
      sendToBack: (id) => this.sendToBack(id),
      moveToPage: (id, pageId) => this.moveToPage(id, pageId),
      flipHorizontal: (id) => this.flipHorizontal(id),
      flipVertical: (id) => this.flipVertical(id),
      rename: (id) => {
        window.dispatchEvent(new CustomEvent('canvas:rename-request', { detail: { id } }));
      },
      toggleVisibility: (id) => {
        const pageId = this.currentPageId();
        if (!pageId) {
          return;
        }

        this.onLayerVisibilityToggled({ pageId, id });
      },
      setAsPrimary: (id) => this.gesture.setPrimaryFrame(id),
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

  private syncElementPatchToPrimary(
    elementId: string,
    _patch: Partial<CanvasElement>,
    elements: CanvasElement[],
  ): CanvasElement[] {
    return this.syncPrimarySubtreeAcrossFrames(elementId, elements);
  }

  private syncElementMoveToPrimary(
    movedElement: CanvasElement | null,
    elements: CanvasElement[],
  ): CanvasElement[] {
    if (!movedElement) {
      return elements;
    }

    return this.syncPrimarySubtreeAcrossFrames(movedElement.id, elements);
  }

  private syncPrimaryFrameResize(
    resizedFrame: CanvasElement,
    elements: CanvasElement[],
  ): CanvasElement[] {
    const primaryFrame = this.getPrimaryFrame(elements);
    if (!primaryFrame || resizedFrame.id !== primaryFrame.id) {
      return elements;
    }

    return this.syncPrimarySubtreeAcrossFrames(primaryFrame.id, elements);
  }

  private syncPrimarySubtreeAcrossFrames(
    sourceRootId: string,
    elements: CanvasElement[],
  ): CanvasElement[] {
    const primaryFrame = this.getPrimaryFrame(elements);
    if (!primaryFrame) {
      return elements;
    }

    if (sourceRootId !== primaryFrame.id) {
      const sourceRoot = elements.find((element) => element.id === sourceRootId);
      if (
        !sourceRoot ||
        sourceRoot.primarySyncId ||
        !this.isElementWithinPrimaryFrame(sourceRoot, elements, primaryFrame.id)
      ) {
        return elements;
      }
    }

    const otherRootFrames = elements.filter(
      (element) => this.isRootFrame(element) && element.id !== primaryFrame.id,
    );
    if (otherRootFrames.length === 0) {
      return elements;
    }

    let nextElements =
      sourceRootId === primaryFrame.id
        ? this.syncRootFramesFromPrimary(primaryFrame, elements)
        : elements;
    for (const frame of otherRootFrames) {
      const targetFrame = nextElements.find((element) => element.id === frame.id) ?? frame;
      nextElements = this.syncPrimarySubtreeToFrame(
        sourceRootId,
        primaryFrame,
        targetFrame,
        nextElements,
      );
    }

    return nextElements;
  }

  private syncRootFramesFromPrimary(
    primaryFrame: CanvasElement,
    elements: CanvasElement[],
  ): CanvasElement[] {
    return elements.map((element) => {
      if (!this.isRootFrame(element) || element.id === primaryFrame.id) {
        return element;
      }

      return {
        ...primaryFrame,
        id: element.id,
        name: element.name,
        x: element.x,
        y: element.y,
        width: element.width,
        height: element.height,
        parentId: null,
        isPrimary: false,
        primarySyncId: undefined,
      };
    });
  }

  private syncPrimarySubtreeToFrame(
    sourceRootId: string,
    primaryFrame: CanvasElement,
    targetFrame: CanvasElement,
    elements: CanvasElement[],
  ): CanvasElement[] {
    const sourceRoot =
      sourceRootId === primaryFrame.id
        ? primaryFrame
        : (elements.find((element) => element.id === sourceRootId) ?? null);
    if (!sourceRoot) {
      return elements;
    }

    const sourceNodes = [
      ...this.getPrimarySourceAncestors(sourceRoot, elements, primaryFrame.id),
      ...this.getPrimarySourceSubtree(sourceRootId, primaryFrame, elements),
    ];
    if (sourceNodes.length === 0) {
      return elements;
    }

    let nextElements = [...elements];
    const syncedBySourceId = new Map<string, CanvasElement>();
    const syncedParentIds = new Map<string, string>();

    for (const sourceElement of sourceNodes) {
      if (!sourceElement.parentId) {
        continue;
      }

      const sourceParent =
        elements.find((element) => element.id === sourceElement.parentId) ?? null;
      if (!sourceParent) {
        continue;
      }

      const targetParent =
        sourceElement.parentId === primaryFrame.id
          ? targetFrame
          : (syncedBySourceId.get(sourceElement.parentId) ??
            this.findSyncedElementInRootFrame(
              sourceElement.parentId,
              targetFrame.id,
              nextElements,
            ));
      if (!targetParent) {
        continue;
      }

      syncedParentIds.set(sourceParent.id, targetParent.id);

      const existingCopy = this.findSyncedElementInRootFrame(
        sourceElement.id,
        targetFrame.id,
        nextElements,
      );
      const syncedElement = this.buildSyncedElementFromSource(
        sourceElement,
        sourceParent,
        targetParent,
        nextElements,
        existingCopy,
      );

      nextElements = this.upsertElement(nextElements, syncedElement);
      syncedBySourceId.set(sourceElement.id, syncedElement);
    }

    for (const [sourceParentId, targetParentId] of syncedParentIds) {
      nextElements = this.syncFlowChildOrderAcrossFrames(
        sourceParentId,
        targetParentId,
        elements,
        nextElements,
      );
    }

    return nextElements;
  }

  private buildSyncedElementFromSource(
    sourceElement: CanvasElement,
    sourceParent: CanvasElement,
    targetParent: CanvasElement,
    elements: CanvasElement[],
    existingCopy: CanvasElement | null,
  ): CanvasElement {
    const sourceParentWidth = this.element.getRenderedWidth(
      sourceParent,
      elements,
      this.currentPage(),
    );
    const sourceParentHeight = this.element.getRenderedHeight(
      sourceParent,
      elements,
      this.currentPage(),
    );
    const targetParentWidth = this.element.getRenderedWidth(
      targetParent,
      elements,
      this.currentPage(),
    );
    const targetParentHeight = this.element.getRenderedHeight(
      targetParent,
      elements,
      this.currentPage(),
    );
    const scaleX = sourceParentWidth > 0 ? targetParentWidth / sourceParentWidth : 1;
    const scaleY = sourceParentHeight > 0 ? targetParentHeight / sourceParentHeight : 1;
    const shouldScalePosition =
      !this.isLayoutContainer(targetParent) || !this.isChildInFlow(sourceElement);
    const syncedSize = this.getSyncedElementSize(sourceElement, scaleX, scaleY);
    const syncedElement: CanvasElement = {
      ...sourceElement,
      id: existingCopy?.id ?? crypto.randomUUID(),
      parentId: targetParent.id,
      primarySyncId: sourceElement.id,
      isPrimary: false,
      x: shouldScalePosition ? roundToTwoDecimals(sourceElement.x * scaleX) : 0,
      y: shouldScalePosition ? roundToTwoDecimals(sourceElement.y * scaleY) : 0,
      width: syncedSize.width,
      height: syncedSize.height,
    };

    mutateNormalizeElement(syncedElement, elements);
    return syncedElement;
  }

  private getSyncedElementSize(
    sourceElement: CanvasElement,
    scaleX: number,
    scaleY: number,
  ): { width: number; height: number } {
    let width = this.getSyncedAxisSize(sourceElement.width, sourceElement.widthMode, scaleX);
    let height = this.getSyncedAxisSize(sourceElement.height, sourceElement.heightMode, scaleY);
    const sourceAspectRatio =
      sourceElement.width > 0 && sourceElement.height > 0
        ? sourceElement.width / sourceElement.height
        : null;

    if (sourceAspectRatio && sourceAspectRatio > 0) {
      if (sourceElement.widthMode === 'fit-image') {
        width = roundToTwoDecimals(height * sourceAspectRatio);
      }

      if (sourceElement.heightMode === 'fit-image') {
        height = roundToTwoDecimals(width / sourceAspectRatio);
      }
    }

    return {
      width: Math.max(1, width),
      height: Math.max(1, height),
    };
  }

  private getPrimarySourceSubtree(
    sourceRootId: string,
    primaryFrame: CanvasElement,
    elements: CanvasElement[],
  ): CanvasElement[] {
    const subtreeIds =
      sourceRootId === primaryFrame.id ? null : new Set(collectSubtreeIds(elements, sourceRootId));
    const sourceElements =
      sourceRootId === primaryFrame.id
        ? elements.filter(
            (element) =>
              !element.primarySyncId &&
              this.isElementWithinPrimaryFrame(element, elements, primaryFrame.id),
          )
        : elements.filter((element) => !element.primarySyncId && !!subtreeIds?.has(element.id));

    return sourceElements.sort(
      (left, right) =>
        this.getElementNestingDepth(left, elements) - this.getElementNestingDepth(right, elements),
    );
  }

  private getPrimarySourceAncestors(
    sourceElement: CanvasElement,
    elements: CanvasElement[],
    primaryFrameId: string,
  ): CanvasElement[] {
    const ancestors: CanvasElement[] = [];
    let parentId = sourceElement.parentId ?? null;

    while (parentId && parentId !== primaryFrameId) {
      const parent = elements.find((element) => element.id === parentId && !element.primarySyncId);
      if (!parent) {
        break;
      }

      ancestors.push(parent);
      parentId = parent.parentId ?? null;
    }

    return ancestors.reverse();
  }

  private isElementWithinPrimaryFrame(
    element: CanvasElement,
    elements: CanvasElement[],
    primaryFrameId: string,
  ): boolean {
    let parentId = element.parentId ?? null;

    while (parentId) {
      if (parentId === primaryFrameId) {
        return true;
      }

      parentId = this.element.findElementById(parentId, elements)?.parentId ?? null;
    }

    return false;
  }

  private findSyncedElementInRootFrame(
    sourceId: string,
    rootFrameId: string,
    elements: CanvasElement[],
  ): CanvasElement | null {
    return (
      elements.find(
        (element) =>
          element.primarySyncId === sourceId &&
          this.findRootFrameId(element, elements) === rootFrameId,
      ) ?? null
    );
  }

  private findRootFrameId(element: CanvasElement, elements: CanvasElement[]): string | null {
    let current: CanvasElement | null = element;

    while (current) {
      if (this.isRootFrame(current)) {
        return current.id;
      }

      current = current.parentId ? this.element.findElementById(current.parentId, elements) : null;
    }

    return null;
  }

  private upsertElement(elements: CanvasElement[], nextElement: CanvasElement): CanvasElement[] {
    const index = elements.findIndex((element) => element.id === nextElement.id);
    if (index === -1) {
      return [...elements, nextElement];
    }

    const nextElements = [...elements];
    nextElements[index] = nextElement;
    return nextElements;
  }

  private syncFlowChildOrderAcrossFrames(
    sourceParentId: string,
    targetParentId: string,
    sourceElements: CanvasElement[],
    targetElements: CanvasElement[],
  ): CanvasElement[] {
    const sourceParent = this.element.findElementById(sourceParentId, sourceElements);
    const targetParent = this.element.findElementById(targetParentId, targetElements);
    if (!sourceParent || !targetParent || !this.isLayoutContainer(sourceParent)) {
      return targetElements;
    }

    const sourceFlowChildren = sourceElements.filter(
      (element) =>
        element.parentId === sourceParentId &&
        !element.primarySyncId &&
        this.isChildInFlow(element),
    );
    if (sourceFlowChildren.length <= 1) {
      return targetElements;
    }

    const sourceOrder = new Map(
      sourceFlowChildren.map((element, index) => [element.id, index] as const),
    );
    const targetIndices: number[] = [];
    const targetFlowChildren: CanvasElement[] = [];

    targetElements.forEach((element, index) => {
      if (
        element.parentId === targetParentId &&
        !!element.primarySyncId &&
        sourceOrder.has(element.primarySyncId) &&
        this.isChildInFlow(element)
      ) {
        targetIndices.push(index);
        targetFlowChildren.push(element);
      }
    });

    if (targetFlowChildren.length <= 1) {
      return targetElements;
    }

    const sortedChildren = [...targetFlowChildren].sort(
      (left, right) =>
        (sourceOrder.get(left.primarySyncId ?? '') ?? Number.MAX_SAFE_INTEGER) -
        (sourceOrder.get(right.primarySyncId ?? '') ?? Number.MAX_SAFE_INTEGER),
    );

    const changed = sortedChildren.some(
      (element, index) => element.id !== targetFlowChildren[index].id,
    );
    if (!changed) {
      return targetElements;
    }

    const nextElements = [...targetElements];
    targetIndices.forEach((elementIndex, index) => {
      nextElements[elementIndex] = sortedChildren[index];
    });

    return nextElements;
  }

  private scaleAxisValue(value: number | undefined, scale: number): number | undefined {
    if (typeof value !== 'number') {
      return value;
    }

    return roundToTwoDecimals(value * scale);
  }

  private getSyncedAxisSize(
    value: number,
    mode: CanvasElement['widthMode'] | CanvasElement['heightMode'] | undefined,
    scale: number,
  ): number {
    if ((mode ?? 'fixed') === 'fixed') {
      return roundToTwoDecimals(value);
    }

    return roundToTwoDecimals(value * scale);
  }

  private scaleScalarValue(value: number | undefined, scale: number): number | undefined {
    if (typeof value !== 'number') {
      return value;
    }

    return roundToTwoDecimals(value * scale);
  }

  private scaleSpacing(
    spacing: CanvasElement['padding'] | CanvasElement['margin'],
    scaleX: number,
    scaleY: number,
  ): CanvasElement['padding'] | CanvasElement['margin'] {
    if (!spacing) {
      return spacing;
    }

    return {
      top: roundToTwoDecimals(spacing.top * scaleY),
      right: roundToTwoDecimals(spacing.right * scaleX),
      bottom: roundToTwoDecimals(spacing.bottom * scaleY),
      left: roundToTwoDecimals(spacing.left * scaleX),
    };
  }

  private scaleCornerRadii(
    radii: CanvasElement['cornerRadii'],
    scale: number,
  ): CanvasElement['cornerRadii'] {
    if (!radii) {
      return radii;
    }

    return {
      topLeft: roundToTwoDecimals(radii.topLeft * scale),
      topRight: roundToTwoDecimals(radii.topRight * scale),
      bottomRight: roundToTwoDecimals(radii.bottomRight * scale),
      bottomLeft: roundToTwoDecimals(radii.bottomLeft * scale),
    };
  }

  private removeSyncedCopiesForSourceSubtree(
    sourceRootId: string,
    elements: CanvasElement[],
    sourceElements: CanvasElement[] = elements,
  ): CanvasElement[] {
    const sourceRoot = sourceElements.find((element) => element.id === sourceRootId);
    if (!sourceRoot || sourceRoot.primarySyncId) {
      return elements;
    }

    const sourceSubtreeIds = new Set(collectSubtreeIds(sourceElements, sourceRootId));
    return elements.filter(
      (element) => !element.primarySyncId || !sourceSubtreeIds.has(element.primarySyncId),
    );
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
    const currentSubtreeIds = new Set(collectSubtreeIds(elements, elementId));

    // Synced copy was moved out of its parent frame → clear its own sync link
    if (current.primarySyncId) {
      return elements.map((element) =>
        currentSubtreeIds.has(element.id) ? { ...element, primarySyncId: undefined } : element,
      );
    }

    const wasInPrimaryScope =
      !!primaryFrame && this.isParentWithinPrimaryScope(prevParentId, elements, primaryFrame.id);
    const isInPrimaryScope =
      !!primaryFrame && this.isParentWithinPrimaryScope(currentParentId, elements, primaryFrame.id);

    // Primary source left the primary sync scope → break sync for the whole mirrored subtree.
    if (wasInPrimaryScope && !isInPrimaryScope) {
      return elements.map((element) =>
        element.primarySyncId && currentSubtreeIds.has(element.primarySyncId)
          ? { ...element, primarySyncId: undefined }
          : element,
      );
    }

    return elements;
  }

  private isParentWithinPrimaryScope(
    parentId: string | null,
    elements: CanvasElement[],
    primaryFrameId: string,
  ): boolean {
    if (!parentId) {
      return false;
    }

    if (parentId === primaryFrameId) {
      return true;
    }

    const parent = this.element.findElementById(parentId, elements);
    return !!parent && this.isElementWithinPrimaryFrame(parent, elements, primaryFrameId);
  }
}
