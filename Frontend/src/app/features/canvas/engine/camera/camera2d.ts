/**
 * Camera2D — handles zoom and pan for the canvas viewport.
 *
 * CHANGE FROM OLD ARCHITECTURE:
 * - Old: CanvasViewportService stored zoomLevel and viewportOffset as Signals,
 *   queried DOM elements via document.querySelector('.canvas-container'),
 *   and mixed coordinate conversion with Angular rendering concerns.
 * - New: Camera2D is a pure, framework-agnostic class. It stores the camera
 *   state and exposes screen↔world transforms via a view matrix. Angular
 *   services wrap it to expose Signals and inject it into components.
 *   DOM queries are replaced by injected element references.
 *
 * The camera conceptually sits "above" the canvas. Its view matrix maps
 * world coordinates to screen coordinates:
 *   screenPoint = viewMatrix * worldPoint
 *   worldPoint  = inverseViewMatrix * screenPoint
 */

import { Vec2, vec2 } from '../math/vec2';
import {
  Mat3,
  mat3Identity,
  mat3Translate,
  mat3Scale,
  mat3Multiply,
  mat3Invert,
  mat3TransformPoint,
} from '../math/mat3';

const DEFAULT_MIN_ZOOM = 0.25;
const DEFAULT_MAX_ZOOM = 3;
const DEFAULT_ZOOM_FACTOR = 1.1;
const DEFAULT_GRID_SIZE = 20;

export interface CameraConfig {
  minZoom: number;
  maxZoom: number;
  zoomFactor: number;
  gridSize: number;
}

export class Camera2D {
  // ── State ─────────────────────────────────────────────────
  private _zoom: number = 1;
  private _offset: Vec2 = vec2(0, 0); // screen-space offset (pan)
  private _version = 0;

  // ── Config ────────────────────────────────────────────────
  private readonly config: CameraConfig;

  // ── Cached matrices ───────────────────────────────────────
  private _viewMatrix: Mat3 = mat3Identity();
  private _inverseViewMatrix: Mat3 | null = null;
  private _matrixDirty = true;

  constructor(config?: Partial<CameraConfig>) {
    this.config = {
      minZoom: config?.minZoom ?? DEFAULT_MIN_ZOOM,
      maxZoom: config?.maxZoom ?? DEFAULT_MAX_ZOOM,
      zoomFactor: config?.zoomFactor ?? DEFAULT_ZOOM_FACTOR,
      gridSize: config?.gridSize ?? DEFAULT_GRID_SIZE,
    };
  }

  // ── Getters ───────────────────────────────────────────────

  get zoom(): number {
    return this._zoom;
  }

  get offset(): Vec2 {
    return this._offset;
  }

  get version(): number {
    return this._version;
  }

  get zoomPercentage(): number {
    return Math.round(this._zoom * 100);
  }

  /**
   * View matrix: transforms world coordinates to screen coordinates.
   * viewMatrix = Translate(offset) * Scale(zoom)
   */
  get viewMatrix(): Mat3 {
    if (this._matrixDirty) {
      this._viewMatrix = mat3Multiply(
        mat3Translate(this._offset.x, this._offset.y),
        mat3Scale(this._zoom, this._zoom),
      );
      this._inverseViewMatrix = null;
      this._matrixDirty = false;
    }
    return this._viewMatrix;
  }

  /** Inverse view matrix: transforms screen coordinates to world coordinates. */
  get inverseViewMatrix(): Mat3 {
    if (!this._inverseViewMatrix) {
      this._inverseViewMatrix = mat3Invert(this.viewMatrix);
    }
    return this._inverseViewMatrix!;
  }

  // ── Coordinate Conversion ─────────────────────────────────

  /**
   * Convert a screen-space point to world-space.
   * @param screenPoint  Point relative to the canvas element's top-left.
   */
  screenToWorld(screenPoint: Vec2): Vec2 {
    return mat3TransformPoint(this.inverseViewMatrix, screenPoint);
  }

  /**
   * Convert a world-space point to screen-space.
   */
  worldToScreen(worldPoint: Vec2): Vec2 {
    return mat3TransformPoint(this.viewMatrix, worldPoint);
  }

  // ── Zoom ──────────────────────────────────────────────────

  /**
   * Set zoom level, optionally anchored at a screen-space point.
   * When an anchor is provided (e.g. cursor position), the world point
   * under the anchor stays fixed — this gives "zoom to cursor" behavior.
   */
  setZoom(newZoom: number, anchor?: Vec2): void {
    const clamped = this.clampZoom(newZoom);
    if (clamped === this._zoom) return;

    if (anchor) {
      // World point under the anchor before zoom
      const worldX = (anchor.x - this._offset.x) / this._zoom;
      const worldY = (anchor.y - this._offset.y) / this._zoom;

      this._offset = vec2(anchor.x - worldX * clamped, anchor.y - worldY * clamped);
    }

    this._zoom = clamped;
    this._matrixDirty = true;
    this._version++;
  }

  /** Zoom in by one step, anchored at a screen-space point. */
  zoomIn(anchor?: Vec2): void {
    this.setZoom(this._zoom * this.config.zoomFactor, anchor);
  }

  /** Zoom out by one step, anchored at a screen-space point. */
  zoomOut(anchor?: Vec2): void {
    this.setZoom(this._zoom / this.config.zoomFactor, anchor);
  }

  /** Reset zoom to 100%, anchored at a screen-space point. */
  resetZoom(anchor?: Vec2): void {
    this.setZoom(1, anchor);
  }

  // ── Pan ───────────────────────────────────────────────────

  /** Apply a screen-space delta to the camera offset. */
  pan(deltaX: number, deltaY: number): void {
    this._offset = vec2(this._offset.x + deltaX, this._offset.y + deltaY);
    this._matrixDirty = true;
    this._version++;
  }

  /** Set the offset directly (used by smooth animations). */
  setOffset(offset: Vec2): void {
    this._offset = offset;
    this._matrixDirty = true;
    this._version++;
  }

  // ── Wheel Handler ─────────────────────────────────────────

  /**
   * Handle a wheel event. Ctrl+wheel = zoom, plain wheel = pan.
   * @param deltaX      WheelEvent.deltaX
   * @param deltaY      WheelEvent.deltaY
   * @param ctrlKey     Whether ctrl/meta is held
   * @param screenPoint Cursor position relative to canvas element
   */
  handleWheel(deltaX: number, deltaY: number, ctrlKey: boolean, screenPoint: Vec2): void {
    if (ctrlKey) {
      const factor = deltaY < 0 ? this.config.zoomFactor : 1 / this.config.zoomFactor;
      this.setZoom(this._zoom * factor, screenPoint);
    } else {
      this.pan(-deltaX, -deltaY);
    }
  }

  // ── Focus / Fit ───────────────────────────────────────────

  /**
   * Focus the camera so that a world-space rectangle is centered and
   * fits within the given viewport size, with optional safe-area insets.
   */
  focusOnRect(
    worldRect: { x: number; y: number; width: number; height: number },
    viewportWidth: number,
    viewportHeight: number,
    insets?: { top: number; right: number; bottom: number; left: number },
    padding = 40,
  ): void {
    const top = insets?.top ?? 0;
    const right = insets?.right ?? 0;
    const bottom = insets?.bottom ?? 0;
    const left = insets?.left ?? 0;

    const safeW = viewportWidth - left - right;
    const safeH = viewportHeight - top - bottom;
    const safeCenterX = left + safeW / 2;
    const safeCenterY = top + safeH / 2;

    const minDim = 24;
    const hZoom = (safeW - padding) / Math.max(worldRect.width, minDim);
    const vZoom = (safeH - padding) / Math.max(worldRect.height, minDim);
    const targetZoom = this.clampZoom(Math.min(hZoom, vZoom));

    const worldCenterX = worldRect.x + worldRect.width / 2;
    const worldCenterY = worldRect.y + worldRect.height / 2;

    this._zoom = targetZoom;
    this._offset = vec2(
      safeCenterX - worldCenterX * targetZoom,
      safeCenterY - worldCenterY * targetZoom,
    );
    this._matrixDirty = true;
    this._version++;
  }

  // ── Grid / Background ─────────────────────────────────────

  /** Compute CSS background-size for the dot grid. */
  getGridBackgroundSize(): string {
    const rawScreen = this.config.gridSize * this._zoom;
    const level = Math.round(Math.log2(rawScreen / this.config.gridSize));
    const size = rawScreen / Math.pow(2, level);
    const rounded = Math.round(size * 100) / 100;
    return `${rounded}px ${rounded}px`;
  }

  /** Compute CSS background-position for the dot grid. */
  getGridBackgroundPosition(): string {
    return `${this._offset.x}px ${this._offset.y}px`;
  }

  // ── Size-Invariant Helper ─────────────────────────────────

  /** Convert a fixed screen-pixel size to world-space size at current zoom. */
  screenToWorldSize(screenSize: number): number {
    return screenSize / this._zoom;
  }

  // ── CSS Transform Strings ─────────────────────────────────

  /** CSS transform for the viewport container (translation only). */
  getViewportTransformCss(): string {
    return `translate(${this._offset.x}px, ${this._offset.y}px)`;
  }

  /** CSS transform for the scene container (scale only). */
  getSceneTransformCss(): string {
    return `scale(${this._zoom})`;
  }

  // ── Snapshot / Restore ────────────────────────────────────

  snapshot(): { zoom: number; offset: Vec2 } {
    return { zoom: this._zoom, offset: { ...this._offset } };
  }

  restore(state: { zoom: number; offset: Vec2 }): void {
    this._zoom = state.zoom;
    this._offset = { ...state.offset };
    this._matrixDirty = true;
    this._version++;
  }

  // ── Private ───────────────────────────────────────────────

  private clampZoom(zoom: number): number {
    return Math.min(this.config.maxZoom, Math.max(this.config.minZoom, zoom));
  }
}
