import { Injectable, signal } from '@angular/core';
import { CanvasElement } from '../../../core/models/canvas.models';
import { roundToTwoDecimals, clamp } from '../utils/canvas-interaction.util';
import { Bounds, Point } from '../canvas.types';

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 3;
const ZOOM_STEP = 0.1;
const GRID_SIZE = 20;

@Injectable()
export class CanvasViewportService {
  readonly zoomLevel = signal(1);
  readonly viewportOffset = signal<Point>({ x: 0, y: 0 });
  readonly isPanning = signal(false);
  readonly isSpacePressed = signal(false);
  readonly frameTemplate = signal({ width: 390, height: 844 });

  private panStartPosition: Point = { x: 0, y: 0 };
  private _panMoved = false;

  get panMoved(): boolean {
    return this._panMoved;
  }

  // ── Zoom ──────────────────────────────────────────────────

  zoomIn(): void {
    this.setZoom(this.zoomLevel() + ZOOM_STEP, this.getCanvasScreenCenter());
  }

  zoomOut(): void {
    this.setZoom(this.zoomLevel() - ZOOM_STEP, this.getCanvasScreenCenter());
  }

  resetZoom(): void {
    this.setZoom(1, this.getCanvasScreenCenter());
  }

  zoomPercentage(): number {
    return Math.round(this.zoomLevel() * 100);
  }

  setZoom(nextZoom: number, anchor?: Point): void {
    const previousZoom = this.zoomLevel();
    const clampedZoom = clamp(nextZoom, MIN_ZOOM, MAX_ZOOM);

    if (clampedZoom === previousZoom) {
      return;
    }

    if (anchor) {
      const offset = this.viewportOffset();
      const worldX = (anchor.x - offset.x) / previousZoom;
      const worldY = (anchor.y - offset.y) / previousZoom;

      this.viewportOffset.set({
        x: roundToTwoDecimals(anchor.x - worldX * clampedZoom),
        y: roundToTwoDecimals(anchor.y - worldY * clampedZoom),
      });
    }

    this.zoomLevel.set(clampedZoom);
  }

  // ── Pan ───────────────────────────────────────────────────

  startPanning(event: MouseEvent): void {
    this.isPanning.set(true);
    this._panMoved = false;
    this.panStartPosition = { x: event.clientX, y: event.clientY };
    event.preventDefault();
    event.stopPropagation();
  }

  updatePan(event: MouseEvent): void {
    const deltaX = event.clientX - this.panStartPosition.x;
    const deltaY = event.clientY - this.panStartPosition.y;

    if (deltaX !== 0 || deltaY !== 0) {
      this._panMoved = true;
      this.viewportOffset.update((offset) => ({
        x: roundToTwoDecimals(offset.x + deltaX),
        y: roundToTwoDecimals(offset.y + deltaY),
      }));
      this.panStartPosition = { x: event.clientX, y: event.clientY };
    }
  }

  endPan(): void {
    this.isPanning.set(false);
  }

  // ── Scroll / Wheel ────────────────────────────────────────

  handleWheel(event: WheelEvent, canvasRect: DOMRect): void {
    if (event.ctrlKey) {
      const delta = event.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP;
      this.setZoom(this.zoomLevel() + delta, {
        x: event.clientX - canvasRect.left,
        y: event.clientY - canvasRect.top,
      });
      return;
    }

    this.viewportOffset.update((offset) => ({
      x: roundToTwoDecimals(offset.x - event.deltaX),
      y: roundToTwoDecimals(offset.y - event.deltaY),
    }));
  }

  // ── Coordinate Transforms ────────────────────────────────

  getCanvasPoint(event: MouseEvent, canvasElement: HTMLElement | null): Point | null {
    if (!canvasElement) {
      return null;
    }

    const rect = canvasElement.getBoundingClientRect();
    const offset = this.viewportOffset();

    return {
      x: roundToTwoDecimals((event.clientX - rect.left - offset.x) / this.zoomLevel()),
      y: roundToTwoDecimals((event.clientY - rect.top - offset.y) / this.zoomLevel()),
    };
  }

  getViewportCenterCanvasPoint(canvasElement: HTMLElement | null): Point {
    if (!canvasElement) {
      return { x: 320, y: 240 };
    }

    const offset = this.viewportOffset();
    return {
      x: roundToTwoDecimals((canvasElement.clientWidth / 2 - offset.x) / this.zoomLevel()),
      y: roundToTwoDecimals((canvasElement.clientHeight / 2 - offset.y) / this.zoomLevel()),
    };
  }

  getScreenInvariantSize(size: number): number {
    return roundToTwoDecimals(size / this.zoomLevel());
  }

  // ── Template Helpers ──────────────────────────────────────

  canvasViewportTransform(): string {
    const offset = this.viewportOffset();
    return `translate(${offset.x}px, ${offset.y}px)`;
  }

  canvasSceneTransform(): string {
    return `scale(${this.zoomLevel()})`;
  }

  canvasBackgroundSize(): string {
    const size = roundToTwoDecimals(GRID_SIZE * this.zoomLevel());
    return `${size}px ${size}px`;
  }

  canvasBackgroundPosition(): string {
    const offset = this.viewportOffset();
    return `${offset.x}px ${offset.y}px`;
  }

  // ── Focus Element ─────────────────────────────────────────

  focusElement(element: CanvasElement, bounds: Bounds, canvasElement: HTMLElement | null): void {
    if (!canvasElement) {
      return;
    }

    const padding = 64;
    const minSize = 24;
    const horizontalZoom = (canvasElement.clientWidth - padding) / Math.max(bounds.width, minSize);
    const verticalZoom = (canvasElement.clientHeight - padding) / Math.max(bounds.height, minSize);
    const zoom = clamp(Math.min(horizontalZoom, verticalZoom), MIN_ZOOM, MAX_ZOOM);

    this.zoomLevel.set(zoom);
    this.viewportOffset.set({
      x: roundToTwoDecimals(
        (canvasElement.clientWidth - bounds.width * zoom) / 2 - bounds.x * zoom,
      ),
      y: roundToTwoDecimals(
        (canvasElement.clientHeight - bounds.height * zoom) / 2 - bounds.y * zoom,
      ),
    });
  }

  // ── Private Helpers ───────────────────────────────────────

  private getCanvasScreenCenter(): Point {
    const canvas = document.querySelector('.canvas-container') as HTMLElement | null;
    if (!canvas) {
      return { x: 400, y: 300 };
    }
    return { x: canvas.clientWidth / 2, y: canvas.clientHeight / 2 };
  }
}
