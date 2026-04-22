import {
  AfterViewChecked,
  Component,
  ElementRef,
  HostListener,
  NgZone,
  OnDestroy,
  viewChild,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import {
  CanvasElement,
  CanvasElementType,
  CanvasPageModel,
  IRNode,
  ConverterPageRequest,
  dataUrlToBlob,
  extractApiErrorMessage,
  PendingProjectFlushService,
  ProjectService,
  CurrentUserService,
} from '@app/core';
import { buildCanvasIR, buildCanvasIRPages } from '../../mappers/canvas-to-ir.mapper';
import { buildCanvasElementsFromIR } from '../../mappers/ir-to-canvas.mapper';
import {
  buildCanvasProjectDocument,
  buildPersistedCanvasDesign,
} from '../../mappers/canvas-persistence.mapper';
import { HeaderBarComponent, ContextMenuComponent, DialogBoxComponent } from '@app/shared';
import type { ContextMenuItem } from '@app/shared';
import { ToolbarComponent } from '../../components/toolbar/toolbar.component';
import { ProjectPanelComponent } from '../../components/project-panel/project-panel.component';
import { PropertiesPanelComponent } from '../../components/properties-panel/properties-panel.component';
import { mutateNormalizeElement } from '../../utils/element/canvas-element-normalization.util';
import { roundToTwoDecimals } from '../../utils/canvas-math.util';
import { collectSubtreeIds, removeWithChildren } from '../../utils/canvas-tree.util';
import {
  generateThumbnail,
  generateThumbnailFromCanvas,
} from '../../utils/pixi/canvas-thumbnail.util';

import {
  getTextFontFamily,
  getTextFontWeight,
  getTextFontStyle,
  getTextFontSize,
  getTextLineHeight,
  getTextLetterSpacing,
  getTextAlignValue,
} from '../../utils/element/canvas-text.util';
import { CanvasPersistenceService } from '../../services/canvas-persistence.service';
import { CanvasGenerationService } from '../../services/canvas-generation.service';
import {
  SupportedFramework,
  HandlePosition,
  CornerHandle,
  FrameTemplateSelection,
  Point,
  Bounds,
  HistorySnapshot,
  CanvasPageLayout,
  FlowDragRenderState,
} from '../../canvas.types';
import { CanvasViewportService } from '../../services/canvas-viewport.service';
import { CanvasHistoryService } from '../../services/editor/canvas-history.service';
import { CanvasClipboardService } from '../../services/editor/canvas-clipboard.service';
import { CanvasElementService } from '../../services/canvas-element.service';
import {
  CanvasKeyboardService,
  KeyboardActionCallbacks,
} from '../../services/editor/canvas-keyboard.service';
import {
  CanvasContextMenuService,
  ContextMenuActionCallbacks,
} from '../../services/editor/canvas-context-menu.service';
import { CanvasEditorStateService } from '../../services/canvas-editor-state.service';
import { CanvasPageService } from '../../services/canvas-page.service';
import { CanvasPageGeometryService } from '../../services/canvas-page-geometry.service';
import { CanvasPixiApplicationService } from '../../services/pixi/canvas-pixi-application.service';
import { CanvasPixiRendererService } from '../../services/pixi/canvas-pixi-renderer.service';
import { CanvasPixiOverlaysService } from '../../services/pixi/canvas-pixi-overlays.service';
import { CanvasPixiGridService } from '../../services/pixi/canvas-pixi-grid.service';
import { CanvasPixiPageShellService } from '../../services/pixi/canvas-pixi-page-shell.service';
import { CanvasPixiLayoutService } from '../../services/pixi/canvas-pixi-layout.service';
import { CanvasGestureService } from '../../services/editor/canvas-gesture.service';
import { firstValueFrom } from 'rxjs';

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
  private readonly router = inject(Router);
  private readonly canvasPersistenceService = inject(CanvasPersistenceService);
  private readonly projectService = inject(ProjectService);
  private readonly currentUser = inject(CurrentUserService);
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

  readonly canvasSceneRef = viewChild<ElementRef<HTMLElement>>('canvasScene');

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
        this.gesture.updateFlowBoundsCache(this.canvasSceneRef()?.nativeElement ?? null);
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

  async navigateToProjectsList(): Promise<void> {
    const cachedUser = this.currentUser.user();
    const username =
      cachedUser?.username ?? (await firstValueFrom(this.currentUser.load()))?.username;

    if (!username) {
      return;
    }

    void this.router.navigate(['/', username]);
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

  onAiDesignApplied(ir: IRNode): void {
    const newElements = buildCanvasElementsFromIR(ir);
    if (newElements.length === 0) return;

    // Remap IDs to guarantee uniqueness
    const idMap = new Map(newElements.map((el) => [el.id, crypto.randomUUID()]));
    const remapped = newElements.map((el) => ({
      ...el,
      id: idMap.get(el.id) ?? crypto.randomUUID(),
      parentId: el.parentId ? (idMap.get(el.parentId) ?? el.parentId) : el.parentId,
    }));

    // Normalize every element so fill/relative sizes are resolved to pixels,
    // sizing modes are validated, and text properties are sanitized.
    // Must iterate in document order (parents before children) so parent sizes
    // are already resolved when children run.
    for (const el of remapped) {
      mutateNormalizeElement(el, remapped);
    }

    this.runWithHistory(() => {
      this.editorState.updateCurrentPageElements(() => remapped);
    });
  }

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

  /** Returns the element currently being text-edited, or null. */
  getTextEditorElement(): CanvasElement | null {
    return this.gesture.getTextEditorElement();
  }

  getTextEditorScreenLeft(): number {
    return this.gesture.getTextEditorScreenLeft();
  }

  getTextEditorScreenTop(): number {
    return this.gesture.getTextEditorScreenTop();
  }

  getTextEditorScreenWidth(): number {
    return this.gesture.getTextEditorScreenWidth();
  }

  getTextEditorScreenHeight(): number {
    return this.gesture.getTextEditorScreenHeight();
  }

  readonly getTextFontFamily = getTextFontFamily;
  readonly getTextFontWeight = getTextFontWeight;
  readonly getTextFontStyle = getTextFontStyle;
  readonly getTextFontSize = getTextFontSize;
  readonly getTextLineHeight = getTextLineHeight;
  readonly getTextLetterSpacing = getTextLetterSpacing;
  readonly getTextAlignValue = getTextAlignValue;

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
    this.gesture.finalizeTextEditing(this.editingTextElementId());
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

    const thumbnailFile = dataUrlToBlob(thumbnail);
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
    const primaryFrame = this.gesture.getPrimaryFrameFromElements(page.elements);
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
    const live = this.gesture.getLiveElementCanvasBounds(element);
    if (live) {
      return live;
    }

    return this.element.getAbsoluteBounds(element, this.elements(), this.currentPage());
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

  // ── Private: History Shortcuts ────────────────────────────

  private runWithHistory(action: () => void): void {
    this.history.runWithHistory(() => this.createHistorySnapshot(), action);
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
    this.gesture.editingTextDraft.set('');
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
          nextElements = this.gesture.syncPrimarySubtreeAcrossFrames(rootId, nextElements);
        }

        return nextElements;
      });
      this.setSelectedElements(pasted.rootIds, pasted.rootIds[pasted.rootIds.length - 1] ?? null);
      this.editingTextElementId.set(null);
      this.gesture.editingTextDraft.set('');
      this.currentTool.set('select');
    });

    this.apiError.set(null);
  }

  private deleteSelectedElement(): void {
    const selectedIds = this.gesture.getSelectionRootIds();
    if (selectedIds.length === 0) {
      return;
    }

    this.runWithHistory(() => {
      this.updateCurrentPageElements((elements) => {
        return selectedIds.reduce((nextElements, selectedId) => {
          const withoutElement = removeWithChildren(nextElements, selectedId);
          return this.gesture.removeSyncedCopiesForSourceSubtree(
            selectedId,
            withoutElement,
            nextElements,
          );
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

  private setPrimaryFrame(elementId: string): void {
    this.runWithHistory(() => {
      this.updateCurrentPageElements((elements) =>
        elements.map((el) =>
          el.type === 'frame' && !el.parentId ? { ...el, isPrimary: el.id === elementId } : el,
        ),
      );
    });
  }
}
