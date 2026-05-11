import {
  AfterViewChecked,
  Component,
  ElementRef,
  HostListener,
  Injector,
  NgZone,
  OnDestroy,
  afterNextRender,
  viewChild,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { NgStyle } from '@angular/common';
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
import { HeaderBarComponent, ContextMenuComponent } from '@app/shared';
import type { ContextMenuItem } from '@app/shared';
import { ToolbarComponent } from '../../components/toolbar/toolbar.component';
import { ProjectPanelComponent } from '../../components/project-panel/project-panel.component';
import { PropertiesPanelComponent } from '../../components/properties-panel/properties-panel.component';
import { CanvasDomElementComponent } from '../../components/canvas-dom-element/canvas-dom-element.component';
import { CanvasLoadingOverlayComponent } from '../../components/canvas-loading-overlay/canvas-loading-overlay.component';
import { mutateNormalizeElement } from '../../utils/element/canvas-element-normalization.util';
import { roundToTwoDecimals } from '../../utils/canvas-math.util';
import { sanitizeSvg, parseSvgDimensions } from '../../utils/svg-sanitizer.util';
import {
  collectSubtreeIds,
  removeWithChildren,
  buildChildrenMap,
} from '../../utils/canvas-tree.util';
import {
  generateThumbnail,
  generateThumbnailHtml2Canvas,
} from '../../utils/pixi/canvas-thumbnail.util';
import {
  getTextFontFamily,
  getTextFontWeight,
  getTextFontStyle,
  getTextFontSize,
  getTextLineHeight,
  getTextLetterSpacing,
  getTextAlignValue,
  getFrameTitle,
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
import { CanvasHistoryPersistenceService } from '../../services/editor/canvas-history-persistence.service';
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
import {
  CanvasPageGeometryService,
  FRAME_TITLE_ZOOM_THRESHOLD,
} from '../../services/canvas-page-geometry.service';
import { CanvasGestureService } from '../../services/editor/canvas-gesture.service';
import { CanvasDomStyleService } from '../../services/canvas-dom-style.service';
import { firstValueFrom } from 'rxjs';
import gsap from 'gsap';
import { gsapFadeIn, gsapFadeOut } from '../../../../shared/utils/gsap-animations.util';

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
    CanvasDomElementComponent,
    CanvasLoadingOverlayComponent,
    NgStyle,
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
    CanvasDomStyleService,
    CanvasGestureService,
  ],
  templateUrl: './canvas-page.component.html',
  styleUrl: './canvas-page.component.css',
})
export class CanvasPage implements OnDestroy, AfterViewChecked {
  private textEditorInitializedId: string | null = null;
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly canvasPersistenceService = inject(CanvasPersistenceService);
  private readonly projectService = inject(ProjectService);
  private readonly currentUser = inject(CurrentUserService);
  readonly generation = inject(CanvasGenerationService);
  readonly viewport = inject(CanvasViewportService);
  readonly frameTitleZoomThreshold = FRAME_TITLE_ZOOM_THRESHOLD;
  private readonly history = inject(CanvasHistoryService);
  private readonly historyPersistence = inject(CanvasHistoryPersistenceService);
  private readonly ngZone = inject(NgZone);
  private readonly injector = inject(Injector);
  private readonly clipboard = inject(CanvasClipboardService);
  readonly element = inject(CanvasElementService);
  private readonly keyboard = inject(CanvasKeyboardService);
  readonly contextMenu = inject(CanvasContextMenuService);
  readonly editorState = inject(CanvasEditorStateService);
  readonly page = inject(CanvasPageService);
  readonly pageLayout = inject(CanvasPageGeometryService);

  readonly gesture = inject(CanvasGestureService);
  private readonly pendingProjectFlush = inject(PendingProjectFlushService);
  private readonly hostEl = inject(ElementRef<HTMLElement>);

  readonly canvasSceneRef = viewChild<ElementRef<HTMLElement>>('canvasScene');
  private readonly deletePageCardRef = viewChild<ElementRef<HTMLElement>>('deletePageCard');
  private readonly customFrameModalRef = viewChild<ElementRef<HTMLElement>>('customFrameModal');

  readonly showCustomFrameDialog = signal(false);

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
  readonly elementMap = this.editorState.elementMap;

  readonly selectedElementLiveBounds = computed(() => {
    const el = this.selectedElement();
    if (!el) return null;
    return this.gesture.getLiveElementCanvasBounds(el);
  });

  readonly visibleElements = computed<CanvasElement[]>(() =>
    this.elements().filter((element) =>
      this.element.isElementEffectivelyVisible(element.id, this.elements()),
    ),
  );

  readonly currentPageName = computed(() => this.currentPage()?.name ?? 'Untitled page');

  /** Pages visible in the canvas — always exactly the current page. */
  readonly canvasVisiblePages = computed(() => {
    const id = this.currentPageId();
    if (!id) return [];
    const pg = this.pages().find((p) => p.id === id);
    return pg ? [pg] : [];
  });

  readonly projectPanelWidth = signal(DEFAULT_PROJECT_PANEL_WIDTH);

  readonly pageChildrenMaps = computed<Map<string, Map<string | null, CanvasElement[]>>>(() => {
    const result = new Map<string, Map<string | null, CanvasElement[]>>();
    for (const pg of this.pages()) {
      result.set(pg.id, buildChildrenMap(pg.elements));
    }
    return result;
  });

  /** O(1) element-id → page-id index. Rebuilt only when pages/elements change. */
  private readonly elementPageIdMap = computed<ReadonlyMap<string, string>>(() => {
    const map = new Map<string, string>();
    for (const pg of this.pages()) {
      for (const el of pg.elements) {
        map.set(el.id, pg.id);
      }
    }
    return map;
  });

  readonly emptyChildrenMap = new Map<string | null, CanvasElement[]>();

  // ── DOM Overlay Computed Signals ──────────────────────────

  readonly flowDragState = computed<FlowDragRenderState | null>(() => {
    const isDragging = this.gesture.isDraggingEl();
    const draggingId = this.gesture.draggingFlowChildId();
    const ghostBounds = this.gesture.flowDragPlaceholder();
    const dropTarget = this.gesture.layoutDropTarget();
    if (!isDragging || !draggingId || !ghostBounds) return null;
    return {
      draggingElementId: draggingId,
      floatingBounds: ghostBounds.bounds,
      placeholder: dropTarget
        ? { containerId: dropTarget.containerId, dropIndex: dropTarget.index }
        : null,
    };
  });

  readonly selectionOverlayBounds = computed<Bounds | null>(() => {
    const selected = this.selectedElement();
    if (!selected || this.gesture.isDraggingEl() || this.editingTextElementId()) return null;
    void this.gesture.flowCacheVersion(); // register reactive dependency

    // Use stable bounds (captured after ngAfterViewChecked when DOM is fully settled) whenever
    // they belong to the currently selected element. This covers two cases:
    //
    // • resize/rotate: model is updated every pointer-move frame. Live-DOM read during CD
    //   is stale (child components haven't painted yet), causing the dirty/clean oscillation
    //   that made the outline flicker/teleport for all element types.
    //
    // • dirty phase (e.g. property change from Design Tab): invalidateFlowBoundsCache fires,
    //   dirty=true, getCachedOverlaySceneBounds uses model-based getAbsoluteBounds (wrong for
    //   flow children where x=0). stableSelectionBounds still holds the last settled position,
    //   so we use it to avoid the 1-frame teleport before markFlowBoundsCacheClean fires.
    //
    // The element ID guard prevents using stale bounds from a previously selected element.
    const stable = this.gesture.stableSelectionBounds();
    const stableBounds = stable?.elementId === selected.id ? stable.bounds : null;

    if (this.gesture.isRotating()) {
      // Rotate: keep the pre-gesture AABB stable so the outline doesn't jump while the
      // element visually spins (the CSS transform handles the visible rotation).
      return stableBounds ?? this.gesture.getCachedOverlaySceneBounds(selected);
    }

    if (this.gesture.isResizing()) {
      // Resize: use the flow-bounds cache directly. With getCachedOverlaySceneBounds now
      // always preferring real DOM cache over the model-based fallback (x=0 for flow
      // children), this gives accurate bounds every frame without teleporting.
      return this.gesture.getCachedOverlaySceneBounds(selected);
    }

    if (this.gesture.isFlowBoundsDirty()) {
      return stableBounds ?? this.gesture.getCachedOverlaySceneBounds(selected);
    }
    return (
      this.gesture.getLiveOverlaySceneBounds(selected) ??
      this.gesture.getCachedOverlaySceneBounds(selected)
    );
  });

  readonly cornerRadiusHandleOffset = computed<number>(() => {
    const s = this.selectedElement();
    const zoom = this.viewport.zoomLevel();
    const radius = s?.cornerRadius ?? 0;
    // Clamp to half the shortest side so the handle never exits the element boundary
    const maxRadius = s ? Math.min(s.width, s.height) / 2 : Infinity;
    const clampedRadius = Math.min(radius, maxRadius);
    // Enforce a minimum of 8px so the handle never overlaps the NW corner resize handle
    // (which sits at left:-4px; top:-4px). At radius=0 the handle sits at left:4; top:4.
    return Math.max(clampedRadius * zoom, 8);
  });

  private getRotatedElementOverlayBounds(
    element: CanvasElement,
    elements: CanvasElement[],
    aabb: Bounds | null,
  ): Bounds | null {
    if (!aabb) return null;
    // CSS transforms keep the transform-origin fixed; with default 50%/50%, AABB center
    // equals the element center regardless of rotation, skew, or 3D transform.
    const centerX = aabb.x + aabb.width / 2;
    const centerY = aabb.y + aabb.height / 2;
    // Model dimensions are correct (getAbsoluteBounds handles fill/relative sizing).
    const absolute = this.element.getAbsoluteBounds(
      element,
      elements,
      this.editorState.currentPage(),
    );
    return {
      x: roundToTwoDecimals(centerX - absolute.width / 2),
      y: roundToTwoDecimals(centerY - absolute.height / 2),
      width: absolute.width,
      height: absolute.height,
    };
  }

  private hasNonTrivialTransform(el: CanvasElement): boolean {
    return (
      (el.rotation ?? 0) !== 0 ||
      (el.skewX ?? 0) !== 0 ||
      (el.skewY ?? 0) !== 0 ||
      (el.scaleX ?? 1) !== 1 ||
      (el.scaleY ?? 1) !== 1 ||
      el.rotationMode === '3d' ||
      (el.depth ?? 0) !== 0
    );
  }

  private hasOnlyRotation(el: CanvasElement): boolean {
    return (
      (el.rotation ?? 0) !== 0 &&
      (el.skewX ?? 0) === 0 &&
      (el.skewY ?? 0) === 0 &&
      (el.scaleX ?? 1) === 1 &&
      (el.scaleY ?? 1) === 1 &&
      el.rotationMode !== '3d' &&
      (el.depth ?? 0) === 0
    );
  }

  private buildOutlineTransform(el: CanvasElement): string | null {
    if (!this.hasOnlyRotation(el)) return null;
    return `rotate(${el.rotation}deg)`;
  }

  readonly selectionOutlineTransform = computed<string | null>(() => {
    const el = this.selectedElement();
    if (!el) return null;
    return this.buildOutlineTransform(el);
  });

  readonly selectionOutlineTransformOrigin = computed<string | null>(() => {
    const el = this.selectedElement();
    if (!el || !this.hasOnlyRotation(el)) return null;
    return `${el.transformOriginX ?? 50}% ${el.transformOriginY ?? 50}%`;
  });

  readonly selectionOutlineDisplayBounds = computed<Bounds | null>(() => {
    const selected = this.selectedElement();
    if (!selected) return null;

    if (!this.hasNonTrivialTransform(selected)) {
      // No visual transform – use live-DOM-tracking bounds (accurate for flow/flex children).
      return this.selectionOverlayBounds();
    }

    // Transformed element: skip live DOM (gives AABB), derive center from AABB then place
    // model dimensions around it. This is correct even for flow children (x/y = 0).
    if (this.gesture.isDraggingEl() || this.editingTextElementId()) return null;

    // Register reactive dependency so bounds update while isRotating() / isResizing().
    void this.gesture.flowCacheVersion();

    // Use the same stable/cached/live strategy as selectionOverlayBounds.
    const stable = this.gesture.stableSelectionBounds();
    const stableBounds = stable?.elementId === selected.id ? stable.bounds : null;

    let aabb: Bounds | null;
    if (this.gesture.isRotating() || this.gesture.isFlowBoundsDirty()) {
      aabb = stableBounds ?? this.gesture.getCachedOverlaySceneBounds(selected);
    } else if (this.gesture.isResizing()) {
      // Transformed elements: DOM AABB cache lags 1 RAF behind each model write → teleport.
      // Model-based bounds are always synchronised with the current model state.
      // • Pure rotation: model center = CSS transform-origin center (50%/50%) → exact.
      // • Skew / scale / 3D: un-skewed rect at the correct model position → no teleport.
      aabb = this.gesture.getModelBasedOverlaySceneBounds(selected);
    } else {
      aabb =
        this.gesture.getLiveOverlaySceneBounds(selected) ??
        this.gesture.getCachedOverlaySceneBounds(selected);
    }

    // For pure 2D rotation: show model-sized rotated box (outline is rotated via CSS).
    // For skew / 3D / scale: use the AABB directly so handles are never stretched/distorted.
    if (this.hasOnlyRotation(selected)) {
      return this.getRotatedElementOverlayBounds(selected, this.editorState.elements(), aabb);
    }
    return aabb;
  });

  readonly selectionHandleMode = computed<'all' | 'ns' | 'ew' | 'text-fit-fit' | 'none'>(() => {
    const s = this.selectedElement();
    if (!s || s.type === 'frame') return 'none';

    if (s.type === 'text') {
      const wMode = s.widthMode ?? 'fixed';
      const hMode = s.heightMode ?? 'fixed';
      if (wMode === 'fill' && hMode === 'fill') return 'none';
      if (wMode === 'fit-content' && hMode === 'fit-content') return 'text-fit-fit';
      // mixed fill + fit → no free axis to resize
      if (
        (wMode === 'fill' && hMode === 'fit-content') ||
        (wMode === 'fit-content' && hMode === 'fill')
      )
        return 'none';
      // width is fit-content or fill → only height is manually sized
      if (wMode === 'fit-content' || wMode === 'fill') return 'ns';
      // height is fit-content or fill → only width is manually sized
      if (hMode === 'fit-content' || hMode === 'fill') return 'ew';
      return 'all';
    }

    const wMode = s.widthMode ?? 'fixed';
    const hMode = s.heightMode ?? 'fixed';
    const wFill = wMode === 'fill';
    const hFill = hMode === 'fill';
    const wFit = wMode === 'fit-content' || wMode === 'fit-image';
    const hFit = hMode === 'fit-content' || hMode === 'fit-image';

    if (wFill && hFill) return 'none';
    if ((wFill && hFit) || (wFit && hFill)) return 'none';
    if (wFill) return 'ns';
    if (hFill) return 'ew';
    if (wFit && hFit) return 'none';
    if (wFit) return 'ns';
    if (hFit) return 'ew';
    return 'all';
  });

  readonly hoveredOverlayBounds = computed<Bounds | null>(() => {
    const hoveredId = this.gesture.hoveredElementId();
    if (
      !hoveredId ||
      this.gesture.isDraggingEl() ||
      this.gesture.isResizing() ||
      this.gesture.isRotating() ||
      this.selectedElementIds().includes(hoveredId)
    ) {
      return null;
    }
    void this.gesture.flowCacheVersion(); // register reactive dependency
    const pageId = this.findPageIdByElementId(hoveredId);
    if (!pageId) return null;
    const elements = this.getPageElementsById(pageId);
    const hovered = this.element.findElementById(hoveredId, elements);
    if (!hovered || hovered.type === 'frame') return null;

    // Suppress hover outline on direct parent containers of any selected element.
    // Without this, the parent layout container (type 'rectangle') renders its hover
    // outline on top of the selected child — visible as a ghost rectangle after rotate.
    if (this.selectedElements().some((sel) => sel.parentId === hoveredId)) return null;

    // For transformed elements, live DOM gives the AABB.
    // Pure 2D rotation: derive model-sized rotated box (outline rotated via CSS).
    // Skew / 3D / scale: use AABB directly so the hover outline is never distorted.
    if (this.hasNonTrivialTransform(hovered)) {
      const aabb = this.gesture.isFlowBoundsDirty()
        ? this.gesture.getCachedOverlaySceneBounds(hovered)
        : (this.gesture.getLiveOverlaySceneBounds(hovered) ??
          this.gesture.getCachedOverlaySceneBounds(hovered));
      if (this.hasOnlyRotation(hovered)) {
        return this.getRotatedElementOverlayBounds(hovered, elements, aabb);
      }
      return aabb;
    }

    // Same two-pass strategy as selectionOverlayBounds:
    // dirty → cached bounds (avoids stale DOM); clean → live DOM (accurate after render).
    if (this.gesture.isFlowBoundsDirty()) {
      return this.gesture.getCachedOverlaySceneBounds(hovered);
    }
    return (
      this.gesture.getLiveOverlaySceneBounds(hovered) ??
      this.gesture.getCachedOverlaySceneBounds(hovered)
    );
  });

  readonly hoveredOutlineTransform = computed<string | null>(() => {
    const hoveredId = this.gesture.hoveredElementId();
    if (!hoveredId) return null;
    const pageId = this.findPageIdByElementId(hoveredId);
    if (!pageId) return null;
    const elements = this.getPageElementsById(pageId);
    const el = this.element.findElementById(hoveredId, elements);
    if (!el) return null;
    return this.buildOutlineTransform(el);
  });

  readonly hoveredOutlineTransformOrigin = computed<string | null>(() => {
    const hoveredId = this.gesture.hoveredElementId();
    if (!hoveredId) return null;
    const pageId = this.findPageIdByElementId(hoveredId);
    if (!pageId) return null;
    const elements = this.getPageElementsById(pageId);
    const el = this.element.findElementById(hoveredId, elements);
    if (!el || !this.hasOnlyRotation(el)) return null;
    return `${el.transformOriginX ?? 50}% ${el.transformOriginY ?? 50}%`;
  });

  readonly resizeTooltip = computed<
    { kind: 'size'; w: number; h: number } | { kind: 'font'; value: number; unit: string } | null
  >(() => {
    if (!this.gesture.isResizing()) return null;
    const el = this.selectedElement();
    if (!el) return null;
    if (this.gesture.isFontSizeResizing()) {
      const value = Number.isFinite(el.fontSize ?? Number.NaN) ? (el.fontSize as number) : 16;
      return { kind: 'font', value, unit: el.fontSizeUnit ?? 'px' };
    }
    const live = this.gesture.getLiveElementCanvasBounds(el);
    if (live) return { kind: 'size', w: Math.round(live.width), h: Math.round(live.height) };
    return { kind: 'size', w: Math.round(el.width), h: Math.round(el.height) };
  });

  readonly multiSelectOverlayBounds = computed<Bounds[]>(() => {
    const selectedElements = this.selectedElements();
    if (selectedElements.length <= 1) return [];
    void this.gesture.flowCacheVersion();
    return selectedElements.map((el) => this.gesture.getCachedOverlaySceneBounds(el));
  });

  readonly syncedSelectionOverlayBounds = computed<Bounds[]>(() => {
    const els = this.getSyncedSelectionHighlightElements(this.selectedElements(), this.elements());
    if (els.length === 0) return [];
    void this.gesture.flowCacheVersion();
    return els.map((el) => this.gesture.getCachedOverlaySceneBounds(el));
  });

  readonly parentOutlineData = computed<{
    bounds: Bounds;
    transform: string | null;
    transformOrigin: string | null;
  } | null>(() => {
    const selected = this.selectedElement();
    if (!selected?.parentId) return null;
    if (this.gesture.isDraggingEl() || this.gesture.isResizing() || this.gesture.isRotating())
      return null;
    void this.gesture.flowCacheVersion();
    const elements = this.elements();
    const parent = this.element.findElementById(selected.parentId, elements);
    if (!parent || parent.type === 'frame') return null;
    const bounds = this.gesture.isFlowBoundsDirty()
      ? this.gesture.getCachedOverlaySceneBounds(parent)
      : (this.gesture.getLiveOverlaySceneBounds(parent) ??
        this.gesture.getCachedOverlaySceneBounds(parent));
    if (!bounds) return null;
    const transform = this.buildOutlineTransform(parent);
    const transformOrigin = this.hasOnlyRotation(parent)
      ? `${parent.transformOriginX ?? 50}% ${parent.transformOriginY ?? 50}%`
      : null;
    return { bounds, transform, transformOrigin };
  });

  // ── Exported template helpers ─────────────────────────────
  readonly getFrameTitle = getFrameTitle;

  // ── API / Generation State ────────────────────────────────

  readonly apiError = this.page.apiError;
  readonly isLoadingDesign = signal(true);
  readonly loadingMessage = signal('Preparing the editor...');
  readonly loadingPercent = signal(5);
  readonly loadingFadingOut = signal(false);
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
  private saveRetryCount = 0;
  private readonly SAVE_MAX_RETRIES = 4;
  private readonly SAVE_RETRY_BASE_MS = 2000;
  private saveRetryTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private hasTriggeredBrowserExitFlush = false;
  private lastPersistedThumbnailDataUrl: string | null = null;
  private pendingThumbnailDataUrl: string | null = null;
  private pendingInitialPageFocusId: string | null = null;
  private suppressNextWindowMenuClose = false;
  private _idleThumbnailTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private _lastPointerEventTime = 0;
  private _isPointerDown = false;

  constructor() {
    this.loadProjectDesign();

    // Wire gesture service to canvas DOM
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

    // Wire viewport CSS vars — this callback runs outside Angular's reactive
    // graph so signal writes during pan/zoom don't schedule CD cycles.
    this.viewport.onUpdate = () => this.applyViewportCssVars();
    this.applyViewportCssVars(); // populate initial values

    // Sync dot-grid CSS vars so the glow mask can align with the dots.
    // (Moved to applyViewportCssVars so it runs alongside transform updates,
    //  avoiding the reactive effect that was triggered on every pan frame.)

    // Animate custom frame modal with settings-page pattern.
    effect(() => {
      if (this.page.isCustomFrameDialogOpen()) {
        this.showCustomFrameDialog.set(true);
        afterNextRender(
          () => {
            const modal = this.customFrameModalRef()?.nativeElement;
            if (modal) gsapFadeIn(this.ngZone, modal);
          },
          { injector: this.injector },
        );
      } else if (this.showCustomFrameDialog()) {
        const modal = this.customFrameModalRef()?.nativeElement;
        if (!modal) {
          this.showCustomFrameDialog.set(false);
        } else {
          gsapFadeOut(this.ngZone, modal, () => this.showCustomFrameDialog.set(false));
        }
      }
    });

    // Animate toast in with GSAP when it first appears.
    effect(() => {
      const toast = this.fileImportToast();
      if (toast && this.wasToastNull) {
        this.wasToastNull = false;
        requestAnimationFrame(() => {
          const el = this.hostEl.nativeElement.querySelector(
            '.file-import-toast',
          ) as HTMLElement | null;
          if (el) {
            gsap.fromTo(
              el,
              { opacity: 0, y: 10 },
              { opacity: 1, y: 0, duration: 0.22, ease: 'power3.out' },
            );
          }
        });
      }
      if (!toast) this.wasToastNull = true;
    });
  }

  ngAfterViewChecked(): void {
    this.page.setCanvasElement(this.getCanvasElement());
    this.restorePendingInitialPageFocus();

    // Populate the inline text editor with the element's existing text on the
    // first CD cycle after the @if block creates the contenteditable div.
    // textContent is set synchronously so the browser paints it on the first frame.
    // focus + caret are deferred to setTimeout(0) so they don't run inside the
    // Angular CD cycle — calling focus() synchronously here can trigger Zone.js
    // focus events mid-cycle, causing an extra CD pass that resets the editor view.
    const editingId = this.editingTextElementId();
    if (editingId && editingId !== this.textEditorInitializedId) {
      const editor = document.querySelector(
        `[data-text-editor-id="${editingId}"]`,
      ) as HTMLElement | null;
      if (editor) {
        this.textEditorInitializedId = editingId;
        const el = this.element.findElementById(editingId, this.editorState.elements());
        const text = el?.text ?? '';
        if (editor.textContent !== text) {
          editor.textContent = text;
        }
        setTimeout(() => {
          const activeEditor = document.querySelector(
            `[data-text-editor-id="${editingId}"]`,
          ) as HTMLElement | null;
          if (!activeEditor) return;
          if (document.activeElement !== activeEditor) {
            activeEditor.focus();
          }
          this.gesture.placeTextEditorCaretAtEnd(activeEditor);
        }, 0);
      }
    } else if (!editingId) {
      this.textEditorInitializedId = null;
    }

    // Flow bounds cache is now refreshed in requestAnimationFrame inside
    // invalidateFlowBoundsCache() (canvas-gesture.service.ts), so no work is
    // needed here. The rAF fires after Angular paints, giving the same settled-DOM
    // guarantee as the previous setTimeout(0) + ngAfterViewChecked approach but
    // throttled to ≤60 refreshes/s regardless of pointermove frequency.
  }

  ngOnDestroy(): void {
    this.cancelIdleThumbnail();
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

    // Cancel any pending entry thumbnail — it already saved on entry or hasn't run yet.
    this.cancelIdleThumbnail();

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

  // ── File drag-and-drop ────────────────────────────────────

  private readonly SUPPORTED_IMAGE_TYPES = new Set([
    'image/png',
    'image/jpeg',
    'image/gif',
    'image/webp',
    'image/avif',
    'image/bmp',
    'image/tiff',
  ]);

  private classifyDropFile(file: File): 'svg' | 'image' | 'unsupported' {
    if (file.type === 'image/svg+xml' || file.name.toLowerCase().endsWith('.svg')) return 'svg';
    if (this.SUPPORTED_IMAGE_TYPES.has(file.type)) return 'image';
    return 'unsupported';
  }

  readonly isFileDragOver = signal(false);
  readonly fileImportToast = signal<{
    state: 'importing' | 'done' | 'error';
    message: string;
  } | null>(null);
  private wasToastNull = true;
  private isToastLeaving = false;
  private fileToastTimer: ReturnType<typeof setTimeout> | null = null;

  private startToastLeave(): void {
    if (this.isToastLeaving) return;
    this.isToastLeaving = true;
    const el = this.hostEl.nativeElement.querySelector('.file-import-toast') as HTMLElement | null;
    if (!el) {
      this.fileImportToast.set(null);
      this.isToastLeaving = false;
      return;
    }
    gsap.to(el, {
      opacity: 0,
      y: 8,
      scale: 0.97,
      duration: 0.2,
      ease: 'power1.in',
      overwrite: true,
      onComplete: () => {
        this.fileImportToast.set(null);
        this.isToastLeaving = false;
      },
    });
  }

  private showFileToast(state: 'importing' | 'done' | 'error', message: string): void {
    if (this.fileToastTimer) clearTimeout(this.fileToastTimer);
    this.isToastLeaving = false;
    if (this.fileImportToast()) {
      const el = this.hostEl.nativeElement.querySelector(
        '.file-import-toast',
      ) as HTMLElement | null;
      if (el) {
        gsap.killTweensOf(el);
        gsap.set(el, { opacity: 1, y: 0, scale: 1 });
      }
    }
    this.fileImportToast.set({ state, message });
    if (state !== 'importing') {
      this.fileToastTimer = setTimeout(() => this.startToastLeave(), 2800);
    }
  }

  dismissFileToast(): void {
    if (this.fileToastTimer) clearTimeout(this.fileToastTimer);
    this.startToastLeave();
  }

  onCanvasDragOver(event: DragEvent): void {
    const hasFile = Array.from(event.dataTransfer?.items ?? []).some(
      (item) => item.kind === 'file',
    );
    if (!hasFile) return;
    event.preventDefault();
    event.dataTransfer!.dropEffect = 'copy';
    this.isFileDragOver.set(true);
  }

  onCanvasDragLeave(event: DragEvent): void {
    const related = event.relatedTarget as HTMLElement | null;
    const container = event.currentTarget as HTMLElement;
    if (!related || !container.contains(related)) {
      this.isFileDragOver.set(false);
    }
  }

  onCanvasDrop(event: DragEvent): void {
    this.isFileDragOver.set(false);
    const files = Array.from(event.dataTransfer?.files ?? []);
    if (!files.length) return;
    event.preventDefault();

    const file = files[0];
    const kind = this.classifyDropFile(file);

    if (kind === 'unsupported') {
      const ext = file.name.includes('.')
        ? '.' + file.name.split('.').pop()!.toLowerCase()
        : file.type || 'unknown';
      this.showFileToast('error', `Cannot import ${ext} files`);
      return;
    }

    if (kind === 'svg') {
      this.showFileToast('importing', 'Importing SVG…');
      const reader = new FileReader();
      reader.onload = (e) => {
        const text = e.target?.result as string;
        if (!text) {
          this.showFileToast('error', 'Import failed');
          return;
        }
        try {
          const sanitized = sanitizeSvg(text);
          const dims = parseSvgDimensions(text);
          this.gesture.importSvgContent(sanitized, dims.width, dims.height);
          this.showFileToast('done', 'SVG imported');
        } catch {
          this.showFileToast('error', 'Import failed');
        }
      };
      reader.onerror = () => this.showFileToast('error', 'Import failed');
      reader.readAsText(file);
      return;
    }

    // kind === 'image'
    if (!Number.isInteger(this.projectIdAsNumber)) {
      this.showFileToast('error', 'Save the project first');
      return;
    }
    this.showFileToast('importing', 'Uploading image…');
    this.projectService.uploadImageAsset(this.projectIdAsNumber, file).subscribe({
      next: ({ assetUrl }) => {
        const img = new Image();
        img.onload = () => {
          this.gesture.importImageAsset(assetUrl, img.naturalWidth, img.naturalHeight);
          this.showFileToast('done', 'Image imported');
        };
        img.onerror = () => {
          this.gesture.importImageAsset(assetUrl, 400, 400);
          this.showFileToast('done', 'Image imported');
        };
        img.src = assetUrl;
      },
      error: () => this.showFileToast('error', 'Upload failed'),
    });
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
    this.page.selectedPageLayerId.set(pageId);

    const layout = this.page.getPageLayoutById(pageId);
    if (!layout) {
      return;
    }

    this.gesture.beginPageDrag(event, pageId, layout);
  }

  onPageShellPointerDown(event: MouseEvent, pageId: string): void {
    if ((event as PointerEvent).pointerType === 'touch') {
      return;
    }
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
    this._isPointerDown = true;
    this._lastPointerEventTime = Date.now();
    const target = event.target as HTMLElement;
    if (this.isCanvasBackgroundTarget(target)) {
      this.page.clearSelectedPageLayer();
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

    if ((event as PointerEvent).pointerType === 'touch') {
      if (!this.pinchActive) {
        this.viewport.startPanning(event);
        this.gesture.cancelDragState();
      }
      return;
    }

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

    // Prefer live DOM bounds — getAbsoluteBounds is incorrect for elements whose ancestors
    // are flow children (model x=0,y=0). Live DOM bounds are always correct regardless of
    // nesting depth. Fallback covers off-screen elements where DOM read is unavailable.
    let bounds =
      this.gesture.getLiveElementCanvasBounds(element) ??
      this.element.getAbsoluteBounds(element, this.elements(), this.currentPage());
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

  onFontSizeResizeHandlePointerDown(event: MouseEvent, id: string): void {
    event.stopPropagation();
    event.preventDefault();
    this.gesture.setSuppressNextCanvasClick(true);
    this.selectOnlyElement(id);
    this.gesture.beginFontSizeResize(event, id);
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
    if (event.pageId !== this.currentPageId()) {
      this.currentPageId.set(event.pageId);
    }

    this.page.layersFocusedPageId.set(event.pageId);

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
    draggedIds: string[];
    targetId: string | null;
    position: 'before' | 'after' | 'inside';
  }): void {
    this.gesture.runWithHistory(() => {
      this.updatePageElements(change.pageId, (elements) => {
        if (change.draggedIds.length === 0) return elements;

        // Keep only root-level dragged elements; children of dragged parents move with their subtree
        const draggedSet = new Set(change.draggedIds);
        const rootDraggedIds = change.draggedIds.filter((id) => {
          const el = this.element.findElementById(id, elements);
          return !el?.parentId || !draggedSet.has(el.parentId);
        });

        // Sort by document order so relative ordering is preserved
        const sorted = rootDraggedIds.sort(
          (a, b) => elements.findIndex((e) => e.id === a) - elements.findIndex((e) => e.id === b),
        );
        if (sorted.length === 0) return elements;

        // Capture bounds for all dragged elements before any moves happen
        const boundsMap = new Map(
          sorted.map((id) => {
            const el = this.element.findElementById(id, elements);
            const bounds = el
              ? (this.gesture.getLiveElementCanvasBounds(el) ??
                this.element.getAbsoluteBounds(el, elements, this.currentPage()))
              : null;
            return [id, bounds] as [string, typeof bounds];
          }),
        );

        // Move first element to the drop target position
        let current = elements;
        const firstId = sorted[0];
        const prevFirst = current;
        current = this.element.reorderLayerElements(
          current,
          firstId,
          change.targetId,
          change.position,
        );
        const firstBounds = boundsMap.get(firstId);
        if (firstBounds) {
          current = this.gesture.normalizeDraggedElementAfterLayerMove(
            prevFirst,
            current,
            firstId,
            firstBounds,
          );
        }

        // Place remaining elements after the previous one, preserving relative order
        let prevId = firstId;
        for (let i = 1; i < sorted.length; i++) {
          const id = sorted[i];
          const prevCurrent = current;
          current = this.element.reorderLayerElements(current, id, prevId, 'after');
          const bounds = boundsMap.get(id);
          if (bounds) {
            current = this.gesture.normalizeDraggedElementAfterLayerMove(
              prevCurrent,
              current,
              id,
              bounds,
            );
          }
          prevId = id;
        }

        return current;
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

  onLayerHovered(id: string | null): void {
    this.gesture.hoveredElementId.set(id);
  }

  onLayerContextMenuRequested(event: { pageId: string; id: string; x: number; y: number }): void {
    if (event.pageId !== this.currentPageId()) {
      this.currentPageId.set(event.pageId);
    }

    this.page.layersFocusedPageId.set(event.pageId);

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

  @HostListener('document:dragleave', ['$event'])
  onDocumentDragLeave(event: DragEvent): void {
    // relatedTarget is null when cursor leaves the browser viewport
    if (event.relatedTarget === null) {
      this.isFileDragOver.set(false);
    }
  }

  @HostListener('window:pointermove', ['$event'])
  onPointerMove(event: MouseEvent): void {
    this._lastPointerEventTime = Date.now();
    const s = this.hostEl.nativeElement.style;
    s.setProperty('--cursor-x', `${event.clientX}px`);
    s.setProperty('--cursor-y', `${event.clientY}px`);

    // Run the entire hover-detection and gesture handling outside Angular's zone so
    // Zone.js does not trigger a full change-detection cycle on every pointermove event
    // (60+ times/sec during pan/resize). Angular signals used inside still propagate
    // correctly — they are zone-independent.
    this.ngZone.runOutsideAngular(() => {
      const isOverPanel = !!(event.target as Element | null)?.closest('app-project-panel');
      const isInGesture =
        this.gesture.isDraggingEl() ||
        this.gesture.isResizing() ||
        this.gesture.isRotating() ||
        this.viewport.isPanning();
      if (!isOverPanel && !this.editingTextElementId() && !isInGesture) {
        const path = event.composedPath() as Element[];
        const elementEl = path.find(
          (el): el is HTMLElement =>
            el instanceof HTMLElement && el.hasAttribute('data-element-id'),
        );
        const hoveredId = elementEl?.getAttribute('data-element-id') ?? null;
        if (hoveredId !== this.gesture.hoveredElementId()) {
          this.gesture.hoveredElementId.set(hoveredId);
        }
      } else if (isInGesture && this.gesture.hoveredElementId() !== null) {
        this.gesture.hoveredElementId.set(null);
      }

      this.gesture.handlePointerMove(event);
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
    this._isPointerDown = false;
    this._lastPointerEventTime = Date.now();
    this.gesture.handlePointerUp(event);
  }

  // ── Wheel ─────────────────────────────────────────────────

  onCanvasWheel(event: WheelEvent): void {
    const canvas = event.currentTarget as HTMLElement | null;
    if (!canvas) {
      return;
    }
    event.preventDefault();
    // Run outside Angular zone so wheel-triggered signal writes don't schedule
    // a full change-detection cycle. The CSS vars callback (onUpdate) handles
    // the visual update synchronously.
    this.ngZone.runOutsideAngular(() => {
      this.viewport.handleWheel(event, canvas.getBoundingClientRect());
    });
  }

  // ── Touch / Pinch ─────────────────────────────────────────

  private pinchActive = false;
  private pinchStartDist = 0;
  private pinchStartZoom = 0;
  private pinchCenter: Point = { x: 0, y: 0 };
  private pinchLastCenter: Point = { x: 0, y: 0 };

  private getTouchDist(touches: TouchList): number {
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.hypot(dx, dy);
  }

  private getTouchCenter(touches: TouchList): Point {
    return {
      x: (touches[0].clientX + touches[1].clientX) / 2,
      y: (touches[0].clientY + touches[1].clientY) / 2,
    };
  }

  @HostListener('touchstart', ['$event'])
  onTouchStart(event: TouchEvent): void {
    if (event.touches.length >= 2) {
      event.preventDefault();
      this.pinchActive = true;
      this.pinchStartDist = this.getTouchDist(event.touches);
      this.pinchStartZoom = this.viewport.zoomLevel();
      this.pinchCenter = this.getTouchCenter(event.touches);
      this.pinchLastCenter = { ...this.pinchCenter };
      this.viewport.endPan();
    }
  }

  @HostListener('touchmove', ['$event'])
  onTouchMove(event: TouchEvent): void {
    if (this.pinchActive && event.touches.length >= 2) {
      event.preventDefault();
      this.ngZone.runOutsideAngular(() => {
        const dist = this.getTouchDist(event.touches);
        const center = this.getTouchCenter(event.touches);

        if (this.pinchStartDist > 0) {
          const scale = dist / this.pinchStartDist;
          // setZoom already calls notifyUpdate()
          this.viewport.setZoom(this.pinchStartZoom * scale, this.pinchCenter);
        }

        // Pan: translate by the delta of the midpoint
        const dx = center.x - this.pinchLastCenter.x;
        const dy = center.y - this.pinchLastCenter.y;
        if (dx !== 0 || dy !== 0) {
          this.viewport.viewportOffset.update((offset) => ({
            x: roundToTwoDecimals(offset.x + dx),
            y: roundToTwoDecimals(offset.y + dy),
          }));
          this.viewport.notifyUpdate();
        }
        this.pinchLastCenter = center;
      });
    }
  }

  @HostListener('touchend', ['$event'])
  onTouchEnd(event: TouchEvent): void {
    if (event.touches.length < 2) {
      this.pinchActive = false;
    }
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

  // ── Delete Page Dialog ────────────────────────────────────

  deletePageRequest(pageId: string): void {
    this.page.deletePage(pageId);
    // Animate card in after the @if block renders it
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const card = this.deletePageCardRef()?.nativeElement;
        if (!card) return;
        gsapFadeIn(this.ngZone, card);
      });
    });
  }

  cancelDeletePage(): void {
    const card = this.deletePageCardRef()?.nativeElement;
    if (!card) {
      this.page.cancelDeletePage();
      return;
    }
    gsapFadeOut(this.ngZone, card, () => this.page.cancelDeletePage());
  }

  confirmDeletePage(): void {
    this.page.confirmDeletePage();
  }

  zoomPercentage(): number {
    return this.viewport.zoomPercentage();
  }

  // ── Template Delegates (viewport) ─────────────────────────

  isPanReady(): boolean {
    return this.currentTool() === 'select' || this.viewport.isSpacePressed();
  }

  // ── DOM Scene Template Helpers ────────────────────────────

  getTopLevelElements(pg: CanvasPageModel): CanvasElement[] {
    const cm = this.pageChildrenMaps().get(pg.id) ?? this.emptyChildrenMap;
    return (cm.get(null) ?? []).filter((el) => el.visible !== false);
  }

  getRootFrames(pg: CanvasPageModel): CanvasElement[] {
    const cm = this.pageChildrenMaps().get(pg.id) ?? this.emptyChildrenMap;
    return (cm.get(null) ?? []).filter((el) => el.type === 'frame');
  }

  getPageShellStyle(pageId: string): Record<string, string> {
    const layouts = this.page.pageLayouts();
    const zoom = this.viewport.zoomLevel();
    return {
      left: this.pageLayout.getPageShellLeft(pageId, layouts) * zoom + 'px',
      top: this.pageLayout.getPageShellTop(pageId, layouts) * zoom + 'px',
      width: this.pageLayout.getPageShellWidth(pageId, layouts) * zoom + 'px',
      height: this.pageLayout.getPageShellHeight(pageId, layouts) * zoom + 'px',
    };
  }

  getPageHeaderStyle(pageId: string): Record<string, string> {
    const layouts = this.page.pageLayouts();
    return {
      left: this.pageLayout.getPageShellHeaderScreenLeft(pageId, layouts) + 'px',
      top: this.pageLayout.getPageShellHeaderScreenTop(pageId, layouts) + 'px',
      width: this.pageLayout.getPageShellHeaderScreenWidth(pageId, layouts) + 'px',
    };
  }

  getFrameTitleStyle(pageId: string, frame: CanvasElement): Record<string, string> {
    const layout = this.page.getPageLayoutById(pageId);
    const zoom = this.viewport.zoomLevel();
    if (!layout) return {};
    return {
      left: (layout.x + frame.x) * zoom + 'px',
      top: (layout.y + frame.y) * zoom - 19 + 'px',
    };
  }

  // ── Page header event handlers ────────────────────────────

  onPageHeaderPointerDown(event: MouseEvent, pageId: string): void {
    if (event.button !== 0) return;
    this.selectPageFromToolbar(pageId);
    this.page.selectedPageLayerId.set(pageId);
  }

  onPageHeaderPlayClick(pageId: string): void {
    this.selectPageFromToolbar(pageId);
    this.page.openPreviewForPage(this.projectSlug, pageId);
  }

  onPageHeaderNameDblClick(pageId: string): void {
    this.selectPageFromToolbar(pageId);
    const syntheticEvent = { preventDefault: () => {}, stopPropagation: () => {} } as MouseEvent;
    this.page.onCanvasHeaderPageNameDoubleClick(syntheticEvent, pageId);
  }

  onPageHeaderAddDeviceClick(event: MouseEvent, pageId: string): void {
    const btn = event.currentTarget as HTMLElement | null;
    const rect = btn?.getBoundingClientRect() ?? { left: 0, bottom: 0 };
    this.suppressNextWindowMenuClose = true;
    this.selectPageFromToolbar(pageId);
    this.page.openDeviceFrameMenuAt(rect.left, rect.bottom, pageId);
  }

  onFrameTitlePointerDown(pageId: string, frameId: string): void {
    if (this.currentPageId() !== pageId) {
      this.currentPageId.set(pageId);
    }
    this.page.layersFocusedPageId.set(pageId);
    this.page.selectedPageLayerId.set(null);
    this.currentTool.set('select');
    this.gesture.setSuppressNextCanvasClick(true);
    this.selectOnlyElement(frameId);
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

    if (targetPageId !== this.currentPageId()) {
      this.currentPageId.set(targetPageId);
    }

    this.page.clearSelectedPageLayer();
    this.page.layersFocusedPageId.set(targetPageId);

    return true;
  }

  private findPageIdByElementId(elementId: string): string | null {
    return this.elementPageIdMap().get(elementId) ?? null;
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

  getTextEditorPadding(element: CanvasElement): string {
    const p = element.padding;
    if (!p) return '0';
    return `${p.top}px ${p.right}px ${p.bottom}px ${p.left}px`;
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

    const navState = this.router.getCurrentNavigation()?.extras.state ?? history.state;
    const fromPreview = navState?.['fromPreview'] === true;

    if (fromPreview) {
      this.isLoadingDesign.set(false);
    } else {
      this.isLoadingDesign.set(true);
      this.loadingMessage.set('Fetching project details...');
      this.loadingPercent.set(20);
    }
    this.apiError.set(null);
    this.canPersistDesign = false;

    const loadingStartedAt = Date.now();
    const hideOverlay = () => {
      if (fromPreview) {
        // Thumbnail was already captured on the initial canvas entry; skip re-capture.
        return;
      }
      const elapsed = Date.now() - loadingStartedAt;
      const remaining = Math.max(0, 1000 - elapsed);
      // Wait for the minimum display time, then run html2canvas while the
      // overlay is still fully visible. Only after the thumbnail is saved
      // (or fails) do we start the fade-out animation.
      setTimeout(() => {
        requestAnimationFrame(() => {
          this.captureAndPersistThumbnailThenHide();
        });
      }, remaining);
    };

    this.projectService.getBySlug(this.projectSlug).subscribe({
      next: (project) => {
        const currentUserId = this.currentUser.user()?.userId;
        if (currentUserId !== undefined && project.userId !== currentUserId) {
          void this.router.navigate(['/project', this.projectSlug, 'preview'], {
            replaceUrl: true,
          });
          return;
        }

        this.projectIdAsNumber = project.projectId;
        this.loadingMessage.set('Loading design...');
        this.loadingPercent.set(55);
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
            this.history.setProjectId(this.projectIdAsNumber);
            void this.historyPersistence.restore(this.projectIdAsNumber).then((stack) => {
              if (stack && stack.length > 0) {
                this.history.restoreStack(stack);
              }
            });
            this.loadingMessage.set('Finishing up...');
            this.loadingPercent.set(100);
            this.canPersistDesign = true;
            hideOverlay();
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

    // A user-driven change resets any retry backoff and cancels any pending retry.
    this.saveRetryCount = 0;
    if (this.saveRetryTimeoutId) {
      clearTimeout(this.saveRetryTimeoutId);
      this.saveRetryTimeoutId = null;
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

    this.page.focusPageInstant(pageId, canvasElement);
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
        this.saveRetryCount = 0;
        this.lastSavedAt.set(response.updatedAt ?? null);
        this.finishPersistDesign();
      },
      error: (error: { error?: { message?: string; title?: string; detail?: string } }) => {
        this.apiError.set(extractApiErrorMessage(error, 'Failed to save project design.'));
        this.isSavingDesign.set(false);

        if (this.saveRetryCount < this.SAVE_MAX_RETRIES) {
          const delay = Math.pow(2, this.saveRetryCount) * this.SAVE_RETRY_BASE_MS;
          this.saveRetryCount++;
          this.hasQueuedDesignPersist = true;
          this.saveRetryTimeoutId = setTimeout(() => {
            this.saveRetryTimeoutId = null;
            this.persistDesign();
          }, delay);
        } else {
          // Max retries exceeded — give up; reset for the next user-triggered change.
          this.saveRetryCount = 0;
          this.hasQueuedDesignPersist = false;
        }
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

  /**
   * Runs html2canvas while the loading overlay is fully visible, saves the
   * thumbnail, then starts the fade-out animation. This way the animation
   * never starts before the thumbnail work is done.
   */
  private captureAndPersistThumbnailThenHide(): void {
    const startFade = () => {
      this.loadingFadingOut.set(true);
      setTimeout(() => {
        this.isLoadingDesign.set(false);
        this.loadingFadingOut.set(false);
      }, 380);
    };

    const page = this.currentPage();
    if (!page || !Number.isInteger(this.projectIdAsNumber)) {
      startFade();
      return;
    }

    generateThumbnailHtml2Canvas(page)
      .then((thumbnail) => {
        if (thumbnail) this.persistThumbnailIfDue(thumbnail);
      })
      .catch(() => {})
      .finally(() => startFade());
  }

  /**
   * Called only in the rare case where the idle-thumbnail needs to be
   * rescheduled (e.g. pointer was down during entry capture).
   */
  private scheduleIdleThumbnail(): void {
    if (!Number.isInteger(this.projectIdAsNumber)) return;
    this.cancelIdleThumbnail();
    const tryCapture = () => {
      this._idleThumbnailTimeoutId = null;
      if (this._isPointerDown) {
        this._idleThumbnailTimeoutId = setTimeout(tryCapture, 500);
        return;
      }
      const page = this.currentPage();
      if (!page) return;
      generateThumbnailHtml2Canvas(page)
        .then((thumbnail) => {
          if (thumbnail) this.persistThumbnailIfDue(thumbnail);
        })
        .catch(() => {});
    };
    this._idleThumbnailTimeoutId = setTimeout(() => requestAnimationFrame(tryCapture), 50);
  }

  private cancelIdleThumbnail(): void {
    if (this._idleThumbnailTimeoutId === null) return;
    clearTimeout(this._idleThumbnailTimeoutId);
    this._idleThumbnailTimeoutId = null;
  }

  private generateThumbnailWithDomBounds(): string | null {
    const domBounds = this.gesture.snapshotAllElementSceneBounds();
    const bounds = domBounds.size > 0 ? domBounds : this.gesture.getLastKnownSceneBounds();
    return generateThumbnail(this.currentPage(), bounds.size > 0 ? bounds : null);
  }

  /** On exit: no thumbnail operation — thumbnail is saved on entry. */
  private persistThumbnailAsync(): void {}

  private persistThumbnailIfDue(precomputedThumbnail?: string | null): void {
    if (!Number.isInteger(this.projectIdAsNumber)) {
      return;
    }

    const thumbnail =
      precomputedThumbnail !== undefined
        ? precomputedThumbnail
        : this.generateThumbnailWithDomBounds();
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
      this.generateThumbnailWithDomBounds(),
    );
    this.hasTriggeredBrowserExitFlush = true;
  }

  private buildCurrentProjectDocument() {
    return buildCanvasProjectDocument(this.pages(), this.projectSlug, this.currentPageId());
  }

  buildCurrentPersistedDesignJson(): string {
    return JSON.stringify(buildPersistedCanvasDesign(this.buildCurrentProjectDocument()));
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
    if ((event as PointerEvent).pointerType === 'touch') {
      return true;
    }
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

  /** Write viewport-derived CSS custom properties directly to the host element.
   *  Called via viewport.onUpdate — runs outside Angular's reactive graph so
   *  changing the viewport never schedules a change-detection cycle. */
  private applyViewportCssVars(): void {
    const offset = this.viewport.viewportOffset();
    const zoom = this.viewport.zoomLevel();
    const s = this.hostEl.nativeElement.style;
    s.setProperty('--vp-x', `${offset.x}px`);
    s.setProperty('--vp-y', `${offset.y}px`);
    s.setProperty('--vp-zoom', `${zoom}`);
    const bgSize = this.viewport.canvasBackgroundSize();
    s.setProperty('--vp-bg-size', bgSize);
    // Keep dot-grid vars in sync (used by the glow-mask overlay in CSS).
    s.setProperty('--dot-size', bgSize);
    s.setProperty('--dot-pos', this.viewport.canvasBackgroundPosition());
  }

  private getTopElementIdAtPoint(x: number, y: number): string | null {
    const elements = this.visibleElements();
    let bestId: string | null = null;
    let bestDepth = -1;

    for (const el of elements) {
      if (el.type === 'frame') continue;
      const live = this.gesture.getLiveElementCanvasBounds(el);
      const b = live ?? this.element.getAbsoluteBounds(el, elements, this.currentPage());
      if (x >= b.x && x <= b.x + b.width && y >= b.y && y <= b.y + b.height) {
        let depth = 0;
        let parentId = el.parentId ?? null;
        while (parentId) {
          const parent = this.element.findElementById(parentId, elements);
          if (!parent) break;
          depth++;
          parentId = parent.parentId ?? null;
        }
        if (depth > bestDepth) {
          bestId = el.id;
          bestDepth = depth;
        }
      }
    }
    return bestId;
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
        // Before removing, record the current rendered height of any parent frame that has
        // heightMode:'fit-content' and whose last child is about to be deleted. When the
        // deletion leaves the frame empty, CSS fit-content collapses to 0px; we freeze the
        // frame at its pre-deletion rendered height instead.
        const page = this.currentPage();
        const fitContentFrameHeights = new Map<string, number>();
        for (const selectedId of selectedIds) {
          const el = elements.find((e) => e.id === selectedId);
          if (!el?.parentId) continue;
          const parent = elements.find((e) => e.id === el.parentId);
          if (!parent || parent.type !== 'frame' || parent.heightMode !== 'fit-content') continue;
          if (!fitContentFrameHeights.has(parent.id)) {
            fitContentFrameHeights.set(
              parent.id,
              this.element.getRenderedHeight(parent, elements, page),
            );
          }
        }

        const afterRemoval = selectedIds.reduce((nextElements, selectedId) => {
          const withoutElement = removeWithChildren(nextElements, selectedId);
          return this.gesture.removeSyncedCopiesForSourceSubtree(
            selectedId,
            withoutElement,
            nextElements,
          );
        }, elements);

        if (fitContentFrameHeights.size === 0) return afterRemoval;

        return afterRemoval.map((el) => {
          const frozenH = fitContentFrameHeights.get(el.id);
          if (frozenH === undefined) return el;
          const stillHasChildren = afterRemoval.some((e) => e.parentId === el.id);
          if (stillHasChildren) return el;
          return { ...el, height: Math.max(1, frozenH), heightMode: undefined };
        });
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
            const page = this.currentPage();
            const fitContentFrameHeights = new Map<string, number>();
            for (const targetId of targetIds) {
              const el = elements.find((e) => e.id === targetId);
              if (!el?.parentId) continue;
              const parent = elements.find((e) => e.id === el.parentId);
              if (!parent || parent.type !== 'frame' || parent.heightMode !== 'fit-content')
                continue;
              if (!fitContentFrameHeights.has(parent.id)) {
                fitContentFrameHeights.set(
                  parent.id,
                  this.element.getRenderedHeight(parent, elements, page),
                );
              }
            }

            const afterRemoval = targetIds.reduce((nextElements, targetId) => {
              const withoutElement = removeWithChildren(nextElements, targetId);
              return this.gesture.removeSyncedCopiesForSourceSubtree(
                targetId,
                withoutElement,
                nextElements,
              );
            }, elements);

            if (fitContentFrameHeights.size === 0) return afterRemoval;

            return afterRemoval.map((el) => {
              const frozenH = fitContentFrameHeights.get(el.id);
              if (frozenH === undefined) return el;
              const stillHasChildren = afterRemoval.some((e) => e.parentId === el.id);
              if (stillHasChildren) return el;
              return { ...el, height: Math.max(1, frozenH), heightMode: undefined };
            });
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
