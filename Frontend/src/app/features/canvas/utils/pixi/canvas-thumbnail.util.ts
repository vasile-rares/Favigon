import { CanvasElement, CanvasPageModel } from '@app/core';
import { getResolvedCornerRadii } from '../element/canvas-element-normalization.util';
import { getAbsolutePos } from '../canvas-tree.util';
import { Bounds } from '../../canvas.types';

const THUMB_W = 300;
const THUMB_H = 168;
const PADDING = 16;
const THUMBNAIL_BACKGROUND = '#111213';

export function generateThumbnailFromCanvas(
  sourceCanvas: HTMLCanvasElement | null,
  sourceBounds: Bounds | null,
): string | null {
  if (!sourceCanvas || !sourceBounds || sourceBounds.width <= 0 || sourceBounds.height <= 0) {
    return null;
  }

  const sourceClientWidth = sourceCanvas.clientWidth || sourceCanvas.width;
  const sourceClientHeight = sourceCanvas.clientHeight || sourceCanvas.height;
  if (sourceClientWidth <= 0 || sourceClientHeight <= 0) {
    return null;
  }

  const sourceScaleX = sourceCanvas.width / sourceClientWidth;
  const sourceScaleY = sourceCanvas.height / sourceClientHeight;
  const sx = Math.max(0, Math.round(sourceBounds.x * sourceScaleX));
  const sy = Math.max(0, Math.round(sourceBounds.y * sourceScaleY));
  const sw = Math.max(
    1,
    Math.min(sourceCanvas.width - sx, Math.round(sourceBounds.width * sourceScaleX)),
  );
  const sh = Math.max(
    1,
    Math.min(sourceCanvas.height - sy, Math.round(sourceBounds.height * sourceScaleY)),
  );

  const canvas = document.createElement('canvas');
  canvas.width = THUMB_W;
  canvas.height = THUMB_H;

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return null;
  }

  const availableWidth = THUMB_W - PADDING * 2;
  const availableHeight = THUMB_H - PADDING * 2;
  const scale = Math.min(
    availableWidth / sourceBounds.width,
    availableHeight / sourceBounds.height,
  );
  const targetWidth = sourceBounds.width * scale;
  const targetHeight = sourceBounds.height * scale;
  const dx = (THUMB_W - targetWidth) / 2;
  const dy = (THUMB_H - targetHeight) / 2;

  ctx.fillStyle = THUMBNAIL_BACKGROUND;
  ctx.fillRect(0, 0, THUMB_W, THUMB_H);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(sourceCanvas, sx, sy, sw, sh, dx, dy, targetWidth, targetHeight);

  return canvas.toDataURL('image/jpeg', 0.86);
}

export function generateThumbnail(
  page: CanvasPageModel | null,
  /**
   * Optional map of element-id → scene-space bounds read from the live DOM.
   * Provide this to get accurate positions for flow children (whose model x/y is 0)
   * and correct AABB dimensions for rotated elements.
   * The map uses scene-space coords (origin at top-left of the canvas scene, zoom=1).
   * pageLayout.x/y must be subtracted to convert to element canvas space.
   */
  domBounds?: Map<string, Bounds> | null,
  pageLayoutX = 0,
  pageLayoutY = 0,
): string | null {
  if (!page || page.elements.length === 0) {
    return null;
  }

  const primaryFrame = getPrimaryRootFrame(page);
  const visibleElements = getThumbnailElements(page, primaryFrame);
  if (visibleElements.length === 0) {
    return null;
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const el of visibleElements) {
    const pos = getElementPos(el, page.elements, domBounds, pageLayoutX, pageLayoutY);
    const w = domBounds?.get(el.id)?.width ?? el.width;
    const h = domBounds?.get(el.id)?.height ?? el.height;
    minX = Math.min(minX, pos.x);
    minY = Math.min(minY, pos.y);
    maxX = Math.max(maxX, pos.x + w);
    maxY = Math.max(maxY, pos.y + h);
  }

  const contentW = maxX - minX || 1;
  const contentH = maxY - minY || 1;
  const scaleX = (THUMB_W - PADDING * 2) / contentW;
  const scaleY = (THUMB_H - PADDING * 2) / contentH;
  const scale = Math.min(scaleX, scaleY, 2);

  const scaledW = contentW * scale;
  const scaledH = contentH * scale;
  const offsetX = (THUMB_W - scaledW) / 2;
  const offsetY = (THUMB_H - scaledH) / 2;

  const canvas = document.createElement('canvas');
  canvas.width = THUMB_W;
  canvas.height = THUMB_H;

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return null;
  }

  ctx.fillStyle = THUMBNAIL_BACKGROUND;
  ctx.fillRect(0, 0, THUMB_W, THUMB_H);

  for (const el of page.elements) {
    if (!visibleElements.some((visibleElement) => visibleElement.id === el.id)) continue;
    drawElement(
      ctx,
      el,
      page.elements,
      minX,
      minY,
      scale,
      offsetX,
      offsetY,
      domBounds,
      pageLayoutX,
      pageLayoutY,
    );
  }

  return canvas.toDataURL('image/jpeg', 0.75);
}

function getThumbnailElements(
  page: CanvasPageModel,
  primaryFrame: CanvasElement | null,
): CanvasElement[] {
  const visibleElements = page.elements.filter((element) => element.visible !== false);
  if (!primaryFrame) {
    return visibleElements;
  }

  return visibleElements.filter((element) =>
    isElementInSubtree(element, primaryFrame.id, page.elements),
  );
}

function getPrimaryRootFrame(page: CanvasPageModel): CanvasElement | null {
  const rootFrames = page.elements.filter(
    (element) => element.type === 'frame' && !element.parentId,
  );
  return (
    rootFrames.find((element) => element.isPrimary) ??
    rootFrames.find((element) => element.name?.toLowerCase() === 'desktop') ??
    rootFrames[0] ??
    null
  );
}

function isElementInSubtree(
  element: CanvasElement,
  rootId: string,
  allElements: CanvasElement[],
): boolean {
  let current: CanvasElement | null = element;

  while (current) {
    if (current.id === rootId) {
      return true;
    }

    const parentId: string | null = current.parentId ?? null;
    current = parentId
      ? (allElements.find((candidate) => candidate.id === parentId) ?? null)
      : null;
  }

  return false;
}

function getElementPos(
  el: CanvasElement,
  allElements: CanvasElement[],
  domBounds: Map<string, Bounds> | null | undefined,
  pageLayoutX: number,
  pageLayoutY: number,
): { x: number; y: number } {
  const dom = domBounds?.get(el.id);
  if (dom) {
    // DOM scene-space → canvas space (subtract page layout offset)
    return { x: dom.x - pageLayoutX, y: dom.y - pageLayoutY };
  }
  return getAbsolutePos(el, allElements);
}

function drawElement(
  ctx: CanvasRenderingContext2D,
  el: CanvasElement,
  allElements: CanvasElement[],
  originX: number,
  originY: number,
  scale: number,
  offsetX: number,
  offsetY: number,
  domBounds?: Map<string, Bounds> | null,
  pageLayoutX = 0,
  pageLayoutY = 0,
): void {
  const absPos = getElementPos(el, allElements, domBounds, pageLayoutX, pageLayoutY);
  const dom = domBounds?.get(el.id);
  // For flow children the DOM width/height reflects fill/relative sizing; use it when available.
  const elW = dom?.width ?? el.width;
  const elH = dom?.height ?? el.height;
  const x = (absPos.x - originX) * scale + offsetX;
  const y = (absPos.y - originY) * scale + offsetY;
  const w = elW * scale;
  const h = elH * scale;
  const opacity = el.opacity ?? 1;

  ctx.save();
  ctx.globalAlpha = opacity;

  if (el.rotation) {
    ctx.translate(x + w / 2, y + h / 2);
    ctx.rotate((el.rotation * Math.PI) / 180);
    ctx.translate(-(x + w / 2), -(y + h / 2));
  }

  switch (el.type) {
    case 'text':
      drawText(ctx, el, x, y, w, h, scale);
      break;
    case 'image':
      drawImagePlaceholder(ctx, el, x, y, w, h, scale);
      break;
    default:
      drawRect(ctx, el, x, y, w, h, scale);
  }

  ctx.restore();
}

function drawRect(
  ctx: CanvasRenderingContext2D,
  el: CanvasElement,
  x: number,
  y: number,
  w: number,
  h: number,
  scale: number,
): void {
  ctx.beginPath();
  buildRoundedRectPath(ctx, x, y, w, h, getScaledCornerRadii(el, scale, w, h));

  if (el.fill && el.fill !== 'transparent') {
    ctx.fillStyle = el.fill;
    ctx.fill();
  }

  if (el.stroke && el.strokeWidth) {
    const sw = el.strokeWidth * scale;
    const style = el.strokeStyle?.toLowerCase() ?? 'solid';
    ctx.strokeStyle = el.stroke;
    ctx.lineWidth = sw;

    if (style === 'dashed') {
      ctx.setLineDash([Math.max(6, sw * 3), Math.max(4, sw * 2)]);
    } else if (style === 'dotted') {
      ctx.setLineDash([sw, sw * 1.5]);
    } else if (style === 'double' && sw >= 3) {
      const lineW = Math.max(1, sw / 3);
      ctx.lineWidth = lineW;
      ctx.stroke();
      ctx.beginPath();
      const inset = sw - lineW;
      buildRoundedRectPath(
        ctx,
        x + inset,
        y + inset,
        w - inset * 2,
        h - inset * 2,
        getScaledCornerRadii(el, scale, w - inset * 2, h - inset * 2),
      );
      ctx.stroke();
      ctx.setLineDash([]);
      return;
    }

    ctx.stroke();
    ctx.setLineDash([]);
  }
}

function drawText(
  ctx: CanvasRenderingContext2D,
  el: CanvasElement,
  x: number,
  y: number,
  w: number,
  h: number,
  scale: number,
): void {
  if (!el.text) return;

  const fontSize = Math.max(Math.round(resolveTextFontSizeInPixels(el) * scale), 6);
  const fontStyle = el.fontStyle === 'italic' ? 'italic' : 'normal';
  const fontWeight = el.fontWeight ?? 400;
  const fontFamily = el.fontFamily ?? 'Inter, Arial, sans-serif';

  ctx.font = `${fontStyle} ${fontWeight} ${fontSize}px ${fontFamily}`;
  ctx.fillStyle = el.fill ?? '#ffffff';
  ctx.textBaseline = 'middle';
  ctx.textAlign = el.textAlign === 'center' || el.textAlign === 'right' ? el.textAlign : 'left';

  const textX = el.textAlign === 'center' ? x + w / 2 : el.textAlign === 'right' ? x + w : x;
  const textY = y + h / 2;

  ctx.save();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.fillText(el.text, textX, textY, w);
  ctx.restore();
}

function resolveTextFontSizeInPixels(el: CanvasElement): number {
  const fontSize = el.fontSize ?? 14;
  return (el.fontSizeUnit ?? 'px') === 'rem' ? fontSize * 16 : fontSize;
}

function drawImagePlaceholder(
  ctx: CanvasRenderingContext2D,
  el: CanvasElement,
  x: number,
  y: number,
  w: number,
  h: number,
  scale: number,
): void {
  const radii = getScaledCornerRadii(el, scale, w, h);

  ctx.save();
  ctx.beginPath();
  buildRoundedRectPath(ctx, x, y, w, h, radii);
  ctx.clip();
  ctx.fillStyle = '#2a2b2e';
  ctx.fillRect(x, y, w, h);

  const iconSize = Math.min(w, h) * 0.3;
  const cx = x + w / 2;
  const cy = y + h / 2;
  ctx.strokeStyle = '#666';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.rect(cx - iconSize / 2, cy - iconSize / 2, iconSize, iconSize);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx - iconSize * 0.1, cy - iconSize * 0.1, iconSize * 0.12, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx - iconSize / 2, cy + iconSize * 0.2);
  ctx.lineTo(cx - iconSize * 0.1, cy - iconSize * 0.1);
  ctx.lineTo(cx + iconSize * 0.2, cy + iconSize * 0.1);
  ctx.lineTo(cx + iconSize / 2, cy - iconSize * 0.2);
  ctx.stroke();
  ctx.restore();

  ctx.beginPath();
  buildRoundedRectPath(ctx, x, y, w, h, radii);
  ctx.strokeStyle = '#444';
  ctx.lineWidth = 1;
  ctx.stroke();
}

function getScaledCornerRadii(
  el: CanvasElement,
  scale: number,
  width: number,
  height: number,
): [number, number, number, number] {
  const radii = getResolvedCornerRadii(el);
  const maxRadius = Math.min(width, height) / 2;

  return [
    Math.min(Math.max(0, radii.topLeft * scale), maxRadius),
    Math.min(Math.max(0, radii.topRight * scale), maxRadius),
    Math.min(Math.max(0, radii.bottomRight * scale), maxRadius),
    Math.min(Math.max(0, radii.bottomLeft * scale), maxRadius),
  ];
}

function buildRoundedRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radii: [number, number, number, number],
): void {
  const [topLeft, topRight, bottomRight, bottomLeft] = radii;

  if (ctx.roundRect) {
    ctx.roundRect(x, y, width, height, radii);
    return;
  }

  ctx.moveTo(x + topLeft, y);
  ctx.lineTo(x + width - topRight, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + topRight);
  ctx.lineTo(x + width, y + height - bottomRight);
  ctx.quadraticCurveTo(x + width, y + height, x + width - bottomRight, y + height);
  ctx.lineTo(x + bottomLeft, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - bottomLeft);
  ctx.lineTo(x, y + topLeft);
  ctx.quadraticCurveTo(x, y, x + topLeft, y);
  ctx.closePath();
}
