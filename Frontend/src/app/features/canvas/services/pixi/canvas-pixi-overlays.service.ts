import { Injectable, inject } from '@angular/core';
import { Container, Graphics, Color, FederatedPointerEvent } from 'pixi.js';
import { CanvasElement } from '@app/core';
import { CanvasPixiApplicationService } from './canvas-pixi-application.service';
import { CanvasPixiRendererService } from './canvas-pixi-renderer.service';
import { CanvasElementService } from '../canvas-element.service';
import { Bounds, HandlePosition, Point, SnapLine, CanvasPageLayout } from '../../canvas.types';
import { getResolvedCornerRadii } from '../../utils/element/canvas-element-normalization.util';
import { roundToTwoDecimals } from '../../utils/canvas-math.util';

const SELECTION_COLOR = 0x3b82f6;
const HOVER_COLOR = 0x3b82f6;
const SNAP_LINE_COLOR = 0xea47ff;
const HANDLE_SIZE = 12;
const HANDLE_HALF = HANDLE_SIZE / 2;
const EDGE_HIT_SIZE = 8;
const CORNER_RADIUS_HANDLE_SIZE = 8;
const CORNER_RADIUS_HANDLE_INSET_OFFSET = 6;
const PAGE_SHELL_BORDER_COLOR = 0xffffff;
const PAGE_SHELL_BORDER_ALPHA = 0.22;
const PAGE_SHELL_BG_ALPHA = 0.03;
const SYNCED_SELECTION_ALPHA = 0.28;

export type HandleHitCallback = (handle: HandlePosition) => void;

interface OverlayQuad {
  nw: Point;
  ne: Point;
  se: Point;
  sw: Point;
}

@Injectable()
export class CanvasPixiOverlaysService {
  private readonly pixiApp = inject(CanvasPixiApplicationService);
  private readonly pixiRenderer = inject(CanvasPixiRendererService);
  private readonly elService = inject(CanvasElementService);

  // Overlay graphics objects
  private readonly selectionOutline = new Graphics();
  private readonly hoverOutline = new Graphics();
  private readonly snapLineV = new Graphics();
  private readonly snapLineH = new Graphics();
  private readonly pageShellOutline = new Graphics();
  private readonly multiSelectOutlines = new Graphics();
  private readonly syncedSelectionOutlines = new Graphics();

  // Resize handles
  private readonly handles: Map<HandlePosition, Graphics> = new Map();
  private readonly edgeHits: Map<string, Graphics> = new Map();
  private readonly cornerRadiusHandle = new Graphics();

  private readonly overlayRoot = new Container({ label: 'overlay-root' });
  private initialized = false;

  init(): void {
    if (this.initialized) return;

    this.overlayRoot.addChild(this.pageShellOutline);
    this.overlayRoot.addChild(this.multiSelectOutlines);
    this.overlayRoot.addChild(this.syncedSelectionOutlines);
    this.overlayRoot.addChild(this.hoverOutline);

    this.selectionOutline.eventMode = 'static';
    this.overlayRoot.addChild(this.selectionOutline);

    this.overlayRoot.addChild(this.snapLineV);
    this.overlayRoot.addChild(this.snapLineH);

    // Create corner resize handles
    const positions: HandlePosition[] = ['nw', 'ne', 'sw', 'se'];
    for (const pos of positions) {
      const handle = new Graphics();
      handle.eventMode = 'static';
      handle.cursor = this.getHandleCursor(pos);
      handle.label = `handle-${pos}`;
      this.handles.set(pos, handle);
      this.overlayRoot.addChild(handle);
    }

    // Create edge hit areas
    const edges: HandlePosition[] = ['n', 's', 'e', 'w'];
    for (const edge of edges) {
      const hit = new Graphics();
      hit.eventMode = 'static';
      hit.cursor = this.getHandleCursor(edge);
      hit.label = `edge-${edge}`;
      hit.alpha = 0; // Invisible
      this.edgeHits.set(edge, hit);
      this.overlayRoot.addChild(hit);
    }

    // Corner radius handle
    this.cornerRadiusHandle.eventMode = 'static';
    this.cornerRadiusHandle.cursor = 'pointer';
    this.cornerRadiusHandle.label = 'corner-radius-handle';
    this.overlayRoot.addChild(this.cornerRadiusHandle);

    this.pixiApp.overlayContainer.addChild(this.overlayRoot);
    this.initialized = true;
  }

  // ── Selection Outline ─────────────────────────────────────

  drawSelectionOutline(
    element: CanvasElement | null,
    elements: CanvasElement[],
    zoom: number,
    pageLayout: CanvasPageLayout | null,
    showHandles: boolean,
  ): void {
    if (!this.initialized) this.init();

    this.selectionOutline.clear();
    this.cornerRadiusHandle.clear();
    this.cornerRadiusHandle.visible = false;

    for (const handle of this.handles.values()) {
      handle.clear();
      handle.visible = false;
    }
    for (const hit of this.edgeHits.values()) {
      hit.clear();
      hit.visible = false;
    }

    if (!element || !pageLayout) {
      this.selectionOutline.visible = false;
      return;
    }

    this.selectionOutline.visible = true;

    const quad = this.getElementOverlayQuad(element, elements, zoom, pageLayout);
    this.traceQuad(this.selectionOutline, quad);
    this.selectionOutline.stroke({ width: 2, color: SELECTION_COLOR });

    if (!showHandles) {
      return;
    }

    // Draw corner handles
    this.drawHandle('nw', quad.nw);
    this.drawHandle('ne', quad.ne);
    this.drawHandle('sw', quad.sw);
    this.drawHandle('se', quad.se);

    // Draw edge hit areas (invisible but interactive)
    this.drawEdgeHit('n', quad.nw, quad.ne);
    this.drawEdgeHit('s', quad.sw, quad.se);
    this.drawEdgeHit('e', quad.ne, quad.se);
    this.drawEdgeHit('w', quad.nw, quad.sw);

    // Corner radius handle
    const supportsCornerRadius = element.type === 'frame' || element.type === 'rectangle';
    if (supportsCornerRadius) {
      const cr = element.cornerRadius ?? 0;
      const topEdgeLength = this.getDistance(quad.nw, quad.ne);
      const rightEdgeLength = this.getDistance(quad.ne, quad.se);
      const maxInset = Math.min(topEdgeLength / 2, rightEdgeLength / 2) - CORNER_RADIUS_HANDLE_SIZE;

      if (maxInset <= 0) {
        this.cornerRadiusHandle.visible = false;
        return;
      }

      const desiredInset =
        Math.max(cr * zoom, CORNER_RADIUS_HANDLE_SIZE) + CORNER_RADIUS_HANDLE_INSET_OFFSET;
      const actualInset = Math.min(desiredInset, maxInset);
      const handleCenter = this.getInsetCornerPoint(quad.ne, quad.nw, quad.se, actualInset);
      const handleRadius = CORNER_RADIUS_HANDLE_SIZE / 2;

      this.cornerRadiusHandle.clear();
      this.cornerRadiusHandle.circle(handleCenter.x, handleCenter.y, handleRadius);
      this.cornerRadiusHandle.fill({ color: SELECTION_COLOR });
      this.cornerRadiusHandle.circle(handleCenter.x, handleCenter.y, handleRadius);
      this.cornerRadiusHandle.stroke({ width: 2, color: 0xffffff });
      this.cornerRadiusHandle.visible = true;
    } else {
      this.cornerRadiusHandle.visible = false;
    }
  }

  // ── Multi-selection Outlines ──────────────────────────────

  drawMultiSelectionOutlines(
    selectedElements: CanvasElement[],
    allElements: CanvasElement[],
    zoom: number,
    pageLayout: CanvasPageLayout | null,
  ): void {
    if (!this.initialized) this.init();
    this.multiSelectOutlines.clear();

    if (selectedElements.length <= 1 || !pageLayout) {
      this.multiSelectOutlines.visible = false;
      return;
    }

    this.multiSelectOutlines.visible = true;

    for (const el of selectedElements) {
      this.traceQuad(
        this.multiSelectOutlines,
        this.getElementOverlayQuad(el, allElements, zoom, pageLayout),
      );
    }

    this.multiSelectOutlines.stroke({ width: 2, color: SELECTION_COLOR });
  }

  drawSyncedSelectionOutlines(
    syncedElements: CanvasElement[],
    allElements: CanvasElement[],
    zoom: number,
    pageLayout: CanvasPageLayout | null,
  ): void {
    if (!this.initialized) this.init();
    this.syncedSelectionOutlines.clear();

    if (syncedElements.length === 0 || !pageLayout) {
      this.syncedSelectionOutlines.visible = false;
      return;
    }

    this.syncedSelectionOutlines.visible = true;

    for (const element of syncedElements) {
      this.traceQuad(
        this.syncedSelectionOutlines,
        this.getElementOverlayQuad(element, allElements, zoom, pageLayout),
      );
    }

    this.syncedSelectionOutlines.stroke({
      width: 1.5,
      color: SELECTION_COLOR,
      alpha: SYNCED_SELECTION_ALPHA,
    });
  }

  // ── Hover Outline ─────────────────────────────────────────

  drawHoverOutline(
    element: CanvasElement | null,
    elements: CanvasElement[],
    zoom: number,
    pageLayout: CanvasPageLayout | null,
  ): void {
    if (!this.initialized) this.init();
    this.hoverOutline.clear();

    if (!element || !pageLayout) {
      this.hoverOutline.visible = false;
      return;
    }

    this.hoverOutline.visible = true;
    this.traceQuad(
      this.hoverOutline,
      this.getElementOverlayQuad(element, elements, zoom, pageLayout),
    );
    this.hoverOutline.stroke({ width: 2, color: HOVER_COLOR });
  }

  // ── Snap Lines ────────────────────────────────────────────

  drawSnapLines(lines: SnapLine[], zoom: number, pageLayout: CanvasPageLayout | null): void {
    if (!this.initialized) this.init();
    this.snapLineV.clear();
    this.snapLineH.clear();

    if (!pageLayout || lines.length === 0) {
      this.snapLineV.visible = false;
      this.snapLineH.visible = false;
      return;
    }

    for (const line of lines) {
      if (line.type === 'vertical') {
        this.snapLineV.visible = true;
        const x = (pageLayout.x + line.position) * zoom;
        this.snapLineV.moveTo(x, -99999);
        this.snapLineV.lineTo(x, 99999);
        this.snapLineV.stroke({ width: 1, color: SNAP_LINE_COLOR });
      } else {
        this.snapLineH.visible = true;
        const y = (pageLayout.y + line.position) * zoom;
        this.snapLineH.moveTo(-99999, y);
        this.snapLineH.lineTo(99999, y);
        this.snapLineH.stroke({ width: 1, color: SNAP_LINE_COLOR });
      }
    }
  }

  // ── Page Shell Selection Outline ──────────────────────────

  drawPageShellSelectionOutline(pageLayout: CanvasPageLayout | null, zoom: number): void {
    if (!this.initialized) this.init();
    this.pageShellOutline.clear();

    if (!pageLayout) {
      this.pageShellOutline.visible = false;
      return;
    }

    this.pageShellOutline.visible = true;
    const sx = pageLayout.x * zoom;
    const sy = pageLayout.y * zoom;
    const sw = pageLayout.width * zoom;
    const sh = pageLayout.height * zoom;

    this.pageShellOutline.roundRect(sx, sy, sw, sh, 16);
    this.pageShellOutline.stroke({
      width: 2,
      color: SELECTION_COLOR,
      alpha: 0.75,
    });
  }

  // ── Bounds Helpers ────────────────────────────────────────

  /**
   * Returns overlay-container-local rect for an element.
   * Uses the actual Pixi container's world transform so flex/grid children
   * with yoga-computed positions are positioned correctly.
   * Falls back to getAbsoluteBounds calculation when the container is not yet rendered.
   */
  private getElementOverlayQuad(
    element: CanvasElement,
    elements: CanvasElement[],
    zoom: number,
    pageLayout: CanvasPageLayout,
  ): OverlayQuad {
    const container = this.pixiRenderer.getContainerForElement(element.id);

    // Fallback sizes from IR bounds (used when node doesn't exist yet)
    const irBounds = this.elService.getAbsoluteBounds(element, elements);
    const nodeSize = this.pixiRenderer.getRenderedNodeSize(element.id);
    const width = nodeSize?.width ?? irBounds.width;
    const height = nodeSize?.height ?? irBounds.height;

    if (container && !container.destroyed) {
      return {
        nw: this.toOverlayPoint(container, 0, 0),
        ne: this.toOverlayPoint(container, width, 0),
        se: this.toOverlayPoint(container, width, height),
        sw: this.toOverlayPoint(container, 0, height),
      };
    }

    const sx = (pageLayout.x + irBounds.x) * zoom;
    const sy = (pageLayout.y + irBounds.y) * zoom;
    const sw = width * zoom;
    const sh = height * zoom;

    return {
      nw: { x: sx, y: sy },
      ne: { x: sx + sw, y: sy },
      se: { x: sx + sw, y: sy + sh },
      sw: { x: sx, y: sy + sh },
    };
  }

  // ── Handle Drawing ────────────────────────────────────────

  private drawHandle(pos: HandlePosition, point: Point): void {
    const handle = this.handles.get(pos as any);
    if (!handle) return;
    handle.clear();
    handle.visible = true;
    const x = point.x - HANDLE_HALF;
    const y = point.y - HANDLE_HALF;
    handle.rect(x, y, HANDLE_SIZE, HANDLE_SIZE);
    handle.fill({ color: 0xffffff });
    handle.rect(x, y, HANDLE_SIZE, HANDLE_SIZE);
    handle.stroke({ width: 1, color: SELECTION_COLOR });
  }

  private drawEdgeHit(edge: string, start: Point, end: Point): void {
    const hit = this.edgeHits.get(edge);
    if (!hit) return;
    hit.clear();
    hit.visible = true;
    hit.poly(this.getEdgeHitPolygon(start, end, EDGE_HIT_SIZE), true);
    hit.fill({ color: 0x000000, alpha: 0.01 });
  }

  private traceQuad(graphics: Graphics, quad: OverlayQuad): void {
    graphics.poly(this.flattenQuad(quad), true);
  }

  private flattenQuad(quad: OverlayQuad): number[] {
    return [quad.nw.x, quad.nw.y, quad.ne.x, quad.ne.y, quad.se.x, quad.se.y, quad.sw.x, quad.sw.y];
  }

  private toOverlayPoint(container: Container, x: number, y: number): Point {
    const globalPoint = container.toGlobal({ x, y });
    const localPoint = this.pixiApp.overlayContainer.toLocal(globalPoint);
    return {
      x: roundToTwoDecimals(localPoint.x),
      y: roundToTwoDecimals(localPoint.y),
    };
  }

  private getEdgeHitPolygon(start: Point, end: Point, thickness: number): number[] {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const length = Math.hypot(dx, dy);

    if (length <= 0.0001) {
      const half = thickness / 2;
      return [
        start.x - half,
        start.y - half,
        start.x + half,
        start.y - half,
        start.x + half,
        start.y + half,
        start.x - half,
        start.y + half,
      ];
    }

    const half = thickness / 2;
    const nx = (-dy / length) * half;
    const ny = (dx / length) * half;

    return [
      start.x + nx,
      start.y + ny,
      end.x + nx,
      end.y + ny,
      end.x - nx,
      end.y - ny,
      start.x - nx,
      start.y - ny,
    ];
  }

  private getInsetCornerPoint(corner: Point, alongA: Point, alongB: Point, inset: number): Point {
    const vectorA = this.getUnitVector(corner, alongA);
    const vectorB = this.getUnitVector(corner, alongB);

    return {
      x: roundToTwoDecimals(corner.x + vectorA.x * inset + vectorB.x * inset),
      y: roundToTwoDecimals(corner.y + vectorA.y * inset + vectorB.y * inset),
    };
  }

  private getUnitVector(from: Point, to: Point): Point {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const length = Math.hypot(dx, dy);

    if (length <= 0.0001) {
      return { x: 0, y: 0 };
    }

    return {
      x: dx / length,
      y: dy / length,
    };
  }

  private getDistance(a: Point, b: Point): number {
    return Math.hypot(b.x - a.x, b.y - a.y);
  }

  private getHandleCursor(pos: HandlePosition): string {
    switch (pos) {
      case 'nw':
      case 'se':
        return 'nwse-resize';
      case 'ne':
      case 'sw':
        return 'nesw-resize';
      case 'n':
      case 's':
        return 'ns-resize';
      case 'e':
      case 'w':
        return 'ew-resize';
    }
  }

  // ── Event Binding ─────────────────────────────────────────

  onHandlePointerDown(callback: (handle: HandlePosition, event: any) => void): void {
    const allPositions: HandlePosition[] = ['nw', 'ne', 'sw', 'se', 'n', 's', 'e', 'w'];
    for (const pos of allPositions) {
      const target = ['n', 's', 'e', 'w'].includes(pos)
        ? this.edgeHits.get(pos)
        : this.handles.get(pos);
      if (target) {
        target.on('pointerdown', (event: any) => callback(pos, event));
      }
    }
  }

  onCornerRadiusHandlePointerDown(callback: (event: any) => void): void {
    this.cornerRadiusHandle.on('pointerdown', callback);
  }

  onSelectionOutlinePointerDown(callback: (event: FederatedPointerEvent) => void): void {
    this.selectionOutline.on('pointerdown', callback);
  }

  onSelectionOutlineDoubleClick(callback: (event: FederatedPointerEvent) => void): void {
    let lastTime = 0;
    this.selectionOutline.on('pointerdown', (e: FederatedPointerEvent) => {
      const now = Date.now();
      if (now - lastTime < 400) {
        callback(e);
        lastTime = 0;
      } else {
        lastTime = now;
      }
    });
  }

  onSelectionOutlineContextMenu(callback: (event: FederatedPointerEvent) => void): void {
    this.selectionOutline.on('rightclick', callback);
  }

  // ── Rectangle Draw Preview ────────────────────────────────

  private rectanglePreview: Graphics | null = null;

  drawRectanglePreview(bounds: Bounds | null, pageLayout: CanvasPageLayout | null): void {
    if (!this.initialized) this.init();

    if (!bounds || !pageLayout) {
      if (this.rectanglePreview) {
        this.rectanglePreview.clear();
        this.rectanglePreview.visible = false;
      }
      return;
    }

    if (!this.rectanglePreview) {
      this.rectanglePreview = new Graphics();
      // Rectangle preview belongs in scene container (scaled space)
      this.pixiApp.sceneContainer.addChild(this.rectanglePreview);
    }

    this.rectanglePreview.visible = true;
    this.rectanglePreview.clear();
    this.rectanglePreview.rect(
      pageLayout.x + bounds.x,
      pageLayout.y + bounds.y,
      bounds.width,
      bounds.height,
    );
    this.rectanglePreview.fill({ color: 0xe0e0e0, alpha: 0.5 });
    this.rectanglePreview.rect(
      pageLayout.x + bounds.x,
      pageLayout.y + bounds.y,
      bounds.width,
      bounds.height,
    );
    this.rectanglePreview.stroke({ width: 1, color: 0x999999 });
  }

  // ── Drop Indicator ────────────────────────────────────────

  private dropIndicator: Graphics | null = null;

  drawDropIndicator(bounds: Bounds | null): void {
    if (!this.initialized) this.init();

    if (!bounds) {
      if (this.dropIndicator) {
        this.dropIndicator.clear();
        this.dropIndicator.visible = false;
      }
      return;
    }

    if (!this.dropIndicator) {
      this.dropIndicator = new Graphics();
      this.pixiApp.sceneContainer.addChild(this.dropIndicator);
    }

    this.dropIndicator.visible = true;
    this.dropIndicator.clear();
    this.dropIndicator.rect(bounds.x, bounds.y, bounds.width, bounds.height);
    this.dropIndicator.fill({ color: SELECTION_COLOR, alpha: 0.3 });
  }

  destroy(): void {
    this.overlayRoot.destroy({ children: true });
    this.rectanglePreview?.destroy();
    this.dropIndicator?.destroy();
    this.handles.clear();
    this.edgeHits.clear();
    this.initialized = false;
  }
}
