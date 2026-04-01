import { Injectable } from '@angular/core';
import {
  CanvasElement,
  CanvasElementType,
  CanvasOverflowMode,
  CanvasPageModel,
  CanvasPositionMode,
  CanvasShadowPreset,
} from '../../../core/models/canvas.models';
import {
  clamp,
  roundToTwoDecimals,
  getDefaultCornerRadius,
  getElementBorderRadiusCss,
  getStrokeWidth,
  hasPerCornerRadius,
  mutateNormalizeElement,
  removeWithChildren,
  collectSubtreeIds,
} from '../utils/canvas-interaction.util';
import { formatCanvasElementTypeLabel } from '../utils/canvas-label.util';
import {
  buildCanvasElementBackfaceVisibility,
  buildCanvasElementTransform,
  buildCanvasElementTransformOrigin,
  buildCanvasElementTransformStyle,
} from '../utils/canvas-transform.util';
import { Bounds, Point } from '../canvas.types';

const IMAGE_PLACEHOLDER_URL = 'https://placehold.co/300x200?text=Image';
const DEFAULT_FRAME_FILL = '#ffffff';
const DEFAULT_ELEMENT_FILL = '#e0e0e0';
const DEFAULT_TEXT_FONT_SIZE = 16;
const ROOT_FONT_SIZE_PX = 16;
const MIN_ELEMENT_SIZE = 24;
const FRAME_INSERT_GAP = 48;
const SHADOW_MAP: Record<CanvasShadowPreset, string> = {
  none: 'none',
  sm: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
  md: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -2px rgba(0, 0, 0, 0.1)',
  lg: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -4px rgba(0, 0, 0, 0.1)',
  xl: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
};

const DEFAULT_ELEMENT_DIMENSIONS: Record<CanvasElementType, { width: number; height: number }> = {
  frame: { width: 390, height: 844 },
  text: { width: 150, height: 40 },
  image: { width: 180, height: 120 },
  rectangle: { width: 100, height: 100 },
};

@Injectable()
export class CanvasElementService {
  // ── Element Factories ─────────────────────────────────────

  createElementAtPoint(
    tool: CanvasElementType,
    pointer: Point,
    elements: CanvasElement[],
    selectedContainer: CanvasElement | null,
    containerBounds: Bounds | null,
    frameTemplateSize: { width: number; height: number },
  ): { element: CanvasElement | null; error: string | null } {
    const defaultWidth =
      tool === 'frame' ? frameTemplateSize.width : DEFAULT_ELEMENT_DIMENSIONS[tool].width;
    const defaultHeight =
      tool === 'frame' ? frameTemplateSize.height : DEFAULT_ELEMENT_DIMENSIONS[tool].height;

    let x = roundToTwoDecimals(pointer.x - defaultWidth / 2);
    let y = roundToTwoDecimals(pointer.y - defaultHeight / 2);
    let parentId: string | null = null;

    if (tool === 'frame') {
      const nextPosition = this.getNextFramePosition(elements, defaultWidth, defaultHeight);
      if (nextPosition) {
        x = nextPosition.x;
        y = nextPosition.y;
      }
    }

    if (tool !== 'frame' && selectedContainer && containerBounds) {
      if (
        !(
          pointer.x >= containerBounds.x &&
          pointer.x <= containerBounds.x + containerBounds.width &&
          pointer.y >= containerBounds.y &&
          pointer.y <= containerBounds.y + containerBounds.height
        )
      ) {
        return {
          element: null,
          error: 'Click inside the selected container to place the element.',
        };
      }

      x = clamp(
        pointer.x - containerBounds.x - defaultWidth / 2,
        0,
        selectedContainer.width - defaultWidth,
      );
      y = clamp(
        pointer.y - containerBounds.y - defaultHeight / 2,
        0,
        selectedContainer.height - defaultHeight,
      );
      parentId = selectedContainer.id;
    }

    return {
      element: {
        id: crypto.randomUUID(),
        type: tool,
        name: this.getNextElementName(tool, elements),
        x,
        y,
        width: defaultWidth,
        height: defaultHeight,
        visible: true,
        fill:
          tool === 'frame'
            ? DEFAULT_FRAME_FILL
            : tool === 'text'
              ? '#000000'
              : DEFAULT_ELEMENT_FILL,
        strokeWidth: tool === 'text' ? undefined : 1,
        strokeStyle: tool === 'text' ? undefined : 'Solid',
        opacity: 1,
        cornerRadius: tool === 'image' ? 6 : 0,
        text: tool === 'text' ? '' : undefined,
        fontSize: tool === 'text' ? 16 : undefined,
        fontSizeUnit: tool === 'text' ? 'px' : undefined,
        fontFamily: tool === 'text' ? 'Inter' : undefined,
        fontWeight: tool === 'text' ? 400 : undefined,
        fontStyle: tool === 'text' ? 'normal' : undefined,
        textAlign: tool === 'text' ? 'center' : undefined,
        textVerticalAlign: tool === 'text' ? 'middle' : undefined,
        letterSpacing: tool === 'text' ? 0 : undefined,
        letterSpacingUnit: tool === 'text' ? 'px' : undefined,
        lineHeight: tool === 'text' ? 1.2 : undefined,
        lineHeightUnit: tool === 'text' ? 'em' : undefined,
        imageUrl: tool === 'image' ? IMAGE_PLACEHOLDER_URL : undefined,
        position: this.getDefaultPositionForPlacement(tool, selectedContainer),
        parentId,
      },
      error: null,
    };
  }

  createFrameAtCenter(
    center: Point,
    width: number,
    height: number,
    name: string,
    elements: CanvasElement[],
  ): CanvasElement {
    const nextPosition = this.getNextFramePosition(elements, width, height);

    return {
      id: crypto.randomUUID(),
      type: 'frame',
      name: this.getNextFrameName(name, elements),
      x: nextPosition?.x ?? roundToTwoDecimals(center.x - width / 2),
      y: nextPosition?.y ?? roundToTwoDecimals(center.y - height / 2),
      width,
      height,
      visible: true,
      fill: DEFAULT_FRAME_FILL,
      strokeWidth: 1,
      strokeStyle: 'Solid',
      opacity: 1,
      cornerRadius: 0,
      parentId: null,
    };
  }

  createRectangleFromBounds(
    bounds: Bounds,
    elements: CanvasElement[],
    selectedContainer: CanvasElement | null,
    containerBounds: Bounds | null,
  ): { element: CanvasElement | null; error: string | null } {
    const maxWidth = selectedContainer ? Math.max(selectedContainer.width, MIN_ELEMENT_SIZE) : null;
    const maxHeight = selectedContainer
      ? Math.max(selectedContainer.height, MIN_ELEMENT_SIZE)
      : null;
    const width = roundToTwoDecimals(
      maxWidth == null
        ? Math.max(bounds.width, MIN_ELEMENT_SIZE)
        : clamp(bounds.width, MIN_ELEMENT_SIZE, maxWidth),
    );
    const height = roundToTwoDecimals(
      maxHeight == null
        ? Math.max(bounds.height, MIN_ELEMENT_SIZE)
        : clamp(bounds.height, MIN_ELEMENT_SIZE, maxHeight),
    );
    const center = {
      x: roundToTwoDecimals(bounds.x + width / 2),
      y: roundToTwoDecimals(bounds.y + height / 2),
    };
    const result = this.createElementAtPoint(
      'rectangle',
      center,
      elements,
      selectedContainer,
      containerBounds,
      { width, height },
    );

    if (!result.element || result.error) {
      return result;
    }

    let x = roundToTwoDecimals(bounds.x);
    let y = roundToTwoDecimals(bounds.y);

    if (selectedContainer && containerBounds) {
      x = clamp(bounds.x - containerBounds.x, 0, Math.max(0, selectedContainer.width - width));
      y = clamp(bounds.y - containerBounds.y, 0, Math.max(0, selectedContainer.height - height));
    }

    return {
      element: {
        ...result.element,
        x: roundToTwoDecimals(x),
        y: roundToTwoDecimals(y),
        width,
        height,
      },
      error: null,
    };
  }

  createPage(name: string): CanvasPageModel {
    return {
      id: crypto.randomUUID(),
      name,
      viewportPreset: 'desktop',
      viewportWidth: 1280,
      viewportHeight: 720,
      canvasX: 0,
      canvasY: 0,
      elements: [],
    };
  }

  // ── Naming ────────────────────────────────────────────────

  getNextPageName(pages: CanvasPageModel[]): string {
    return `Page ${pages.length + 1}`;
  }

  getNextElementName(type: CanvasElementType, elements: CanvasElement[]): string {
    if (type === 'rectangle' || type === 'text' || type === 'image' || type === 'frame') {
      return formatCanvasElementTypeLabel(type);
    }

    const index = elements.filter((element) => element.type === type).length + 1;
    return `${formatCanvasElementTypeLabel(type)} ${index}`;
  }

  getNextFrameName(templateName: string, elements: CanvasElement[]): string {
    return templateName;
  }

  // ── Tree Queries ──────────────────────────────────────────

  findElementById(id: string | null, elements: CanvasElement[]): CanvasElement | null {
    if (!id) {
      return null;
    }
    return elements.find((element) => element.id === id) ?? null;
  }

  getAbsoluteBounds(element: CanvasElement, elements: CanvasElement[]): Bounds {
    const parent = this.findElementById(element.parentId ?? null, elements);
    if (!parent || element.type === 'frame') {
      return {
        x: roundToTwoDecimals(element.x),
        y: roundToTwoDecimals(element.y),
        width: roundToTwoDecimals(element.width),
        height: roundToTwoDecimals(element.height),
      };
    }

    const parentBounds = this.getAbsoluteBounds(parent, elements);
    return {
      x: roundToTwoDecimals(parentBounds.x + element.x),
      y: roundToTwoDecimals(parentBounds.y + element.y),
      width: roundToTwoDecimals(element.width),
      height: roundToTwoDecimals(element.height),
    };
  }

  isElementEffectivelyVisible(elementId: string, elements: CanvasElement[]): boolean {
    let current = this.findElementById(elementId, elements);

    while (current) {
      if (current.visible === false) {
        return false;
      }
      current = this.findElementById(current.parentId ?? null, elements);
    }

    return true;
  }

  isContainerElement(element: CanvasElement | null | undefined): element is CanvasElement {
    return !!element && (element.type === 'frame' || element.type === 'rectangle');
  }

  isLayoutContainerElement(element: CanvasElement | null | undefined): element is CanvasElement {
    return !!element && this.isContainerElement(element) && !!element.display;
  }

  getDefaultPositionForPlacement(
    type: CanvasElementType,
    parent: CanvasElement | null | undefined,
  ): CanvasPositionMode | undefined {
    if (type === 'frame') {
      return undefined;
    }

    return this.isLayoutContainerElement(parent) ? 'relative' : 'absolute';
  }

  getSelectedContainer(selectedElement: CanvasElement | null): CanvasElement | null {
    return this.isContainerElement(selectedElement) ? selectedElement : null;
  }

  // ── Frame Positioning ─────────────────────────────────────

  getNextFramePosition(elements: CanvasElement[], width: number, height: number): Point | null {
    const rootFrames = elements.filter((element) => element.type === 'frame' && !element.parentId);

    if (rootFrames.length === 0) {
      return null;
    }

    const rightMostFrame = rootFrames.reduce((currentRightMost, candidate) => {
      const currentBounds = this.getAbsoluteBounds(currentRightMost, elements);
      const candidateBounds = this.getAbsoluteBounds(candidate, elements);
      const currentRight = currentBounds.x + currentBounds.width;
      const candidateRight = candidateBounds.x + candidateBounds.width;
      return candidateRight > currentRight ? candidate : currentRightMost;
    }, rootFrames[0]);

    const bounds = this.getAbsoluteBounds(rightMostFrame, elements);
    return {
      x: roundToTwoDecimals(bounds.x + bounds.width + FRAME_INSERT_GAP),
      y: roundToTwoDecimals(bounds.y),
    };
  }

  // ── Layer Reordering ──────────────────────────────────────

  reorderLayerElements(
    elements: CanvasElement[],
    draggedId: string,
    targetId: string | null,
    position: 'before' | 'after' | 'inside',
  ): CanvasElement[] {
    if (draggedId === targetId) {
      return elements;
    }

    const dragged = elements.find((element) => element.id === draggedId);
    const target = targetId ? (elements.find((element) => element.id === targetId) ?? null) : null;
    if (!dragged || (targetId && !target)) {
      return elements;
    }

    if (
      position === 'inside' &&
      targetId !== null &&
      (!this.canContainChildren(target!) || dragged.type === 'frame')
    ) {
      return elements;
    }

    const draggedSubtreeIds = new Set(collectSubtreeIds(elements, draggedId));
    if (targetId !== null && draggedSubtreeIds.has(targetId)) {
      return elements;
    }

    const draggedSubtree = elements.filter((element) => draggedSubtreeIds.has(element.id));
    const remaining = elements.filter((element) => !draggedSubtreeIds.has(element.id));
    const draggedRoot = draggedSubtree[0];
    if (!draggedRoot) {
      return elements;
    }

    const draggedBounds = this.getAbsoluteBounds(dragged, elements);
    const targetIndex = targetId
      ? remaining.findIndex((element) => element.id === targetId)
      : remaining.length;
    if (targetId && targetIndex === -1) {
      return elements;
    }

    const targetSubtreeIds = targetId ? collectSubtreeIds(remaining, targetId) : [];

    let nextParentId = dragged.parentId ?? null;
    let insertIndex = targetIndex;

    if (position === 'inside') {
      nextParentId = target?.id ?? null;
      insertIndex = target ? targetIndex + targetSubtreeIds.length : remaining.length;
    } else {
      if (!target) {
        return elements;
      }
      nextParentId = target.parentId ?? null;
      insertIndex = position === 'after' ? targetIndex + targetSubtreeIds.length : targetIndex;
    }

    const nextParent = nextParentId
      ? (remaining.find((element) => element.id === nextParentId) ?? null)
      : null;

    draggedRoot.parentId = nextParentId;
    draggedRoot.position = this.getDefaultPositionForPlacement(draggedRoot.type, nextParent);
    if (nextParent) {
      const parentBounds = this.getAbsoluteBounds(nextParent, remaining);
      draggedRoot.x = clamp(
        draggedBounds.x - parentBounds.x,
        0,
        nextParent.width - draggedRoot.width,
      );
      draggedRoot.y = clamp(
        draggedBounds.y - parentBounds.y,
        0,
        nextParent.height - draggedRoot.height,
      );
    } else {
      draggedRoot.x = roundToTwoDecimals(draggedBounds.x);
      draggedRoot.y = roundToTwoDecimals(draggedBounds.y);
    }

    return [...remaining.slice(0, insertIndex), ...draggedSubtree, ...remaining.slice(insertIndex)];
  }

  private canContainChildren(element: CanvasElement): boolean {
    return this.isContainerElement(element);
  }

  // ── Element Update Helper ────────────────────────────────

  updatePageElements(
    pages: CanvasPageModel[],
    currentPageId: string,
    updater: (elements: CanvasElement[]) => CanvasElement[],
  ): CanvasPageModel[] {
    return pages.map((page) =>
      page.id === currentPageId ? { ...page, elements: updater(page.elements) } : page,
    );
  }

  // ── Template Rendering Helpers ───────────────────────────

  getElementStrokeStyle(element: CanvasElement): string {
    if (!element.stroke || element.type === 'text') {
      return 'none';
    }

    const strokeWidth = getStrokeWidth(element);
    if (strokeWidth <= 0) {
      return 'none';
    }

    const cssStyle = (element.strokeStyle ?? 'Solid').toLowerCase();
    return `${strokeWidth}px ${cssStyle} ${element.stroke}`;
  }

  getElementTransform(element: CanvasElement): string | null {
    return buildCanvasElementTransform(element);
  }

  getElementTransformOrigin(element: CanvasElement): string | null {
    return buildCanvasElementTransformOrigin(element);
  }

  getElementBackfaceVisibility(element: CanvasElement): string | null {
    return buildCanvasElementBackfaceVisibility(element);
  }

  getElementTransformStyle(element: CanvasElement): string | null {
    return buildCanvasElementTransformStyle(element);
  }

  getElementBoxShadow(element: CanvasElement): string {
    return SHADOW_MAP[element.shadow ?? 'none'] ?? SHADOW_MAP.none;
  }

  getElementOverflowMode(element: CanvasElement): CanvasOverflowMode {
    return element.overflow ?? 'clip';
  }

  getElementClipPath(element: CanvasElement, elements: CanvasElement[]): string {
    const parent = this.findElementById(element.parentId ?? null, elements);
    if (!parent) {
      return 'none';
    }

    if (this.getElementOverflowMode(parent) !== 'clip') {
      return 'none';
    }

    const bounds = this.getAbsoluteBounds(element, elements);
    const parentBounds = this.getAbsoluteBounds(parent, elements);
    const topInset = Math.max(0, parentBounds.y - bounds.y);
    const rightInset = Math.max(0, bounds.x + bounds.width - (parentBounds.x + parentBounds.width));
    const bottomInset = Math.max(
      0,
      bounds.y + bounds.height - (parentBounds.y + parentBounds.height),
    );
    const leftInset = Math.max(0, parentBounds.x - bounds.x);

    if (topInset === 0 && rightInset === 0 && bottomInset === 0 && leftInset === 0) {
      return 'none';
    }

    return `inset(${topInset}px ${rightInset}px ${bottomInset}px ${leftInset}px)`;
  }

  isElementClippedOut(element: CanvasElement, elements: CanvasElement[]): boolean {
    const parent = this.findElementById(element.parentId ?? null, elements);
    if (!parent) {
      return false;
    }

    if (this.getElementOverflowMode(parent) !== 'clip') {
      return false;
    }

    const bounds = this.getAbsoluteBounds(element, elements);
    const parentBounds = this.getAbsoluteBounds(parent, elements);
    const intersectionWidth =
      Math.min(bounds.x + bounds.width, parentBounds.x + parentBounds.width) -
      Math.max(bounds.x, parentBounds.x);
    const intersectionHeight =
      Math.min(bounds.y + bounds.height, parentBounds.y + parentBounds.height) -
      Math.max(bounds.y, parentBounds.y);

    return intersectionWidth <= 0 || intersectionHeight <= 0;
  }

  supportsCornerRadius(element: CanvasElement): boolean {
    return element.type !== 'text' && element.type !== 'frame' && !hasPerCornerRadius(element);
  }

  getElementBorderRadius(element: CanvasElement): string {
    return getElementBorderRadiusCss(element);
  }

  getCornerRadiusHandleInset(element: CanvasElement): number {
    const radius = getDefaultCornerRadius(element);

    const handleRadius = 6; // half of 12px handle size
    const maxInset = Math.max(0, Math.min(element.width / 2, element.height / 2) - handleRadius);
    // Handle center sits at (radius, radius) from the element corner,
    // so CSS top/right = radius - handleRadius. Clamped for small elements.
    return roundToTwoDecimals(clamp(radius - handleRadius, 0, maxInset));
  }

  // ── Text Rendering Helpers ───────────────────────────────

  getTextFontFamily(element: CanvasElement): string {
    return element.fontFamily ?? 'Inter';
  }

  getTextFontWeight(element: CanvasElement): number {
    return element.fontWeight ?? 400;
  }

  getTextFontStyle(element: CanvasElement): string {
    return element.fontStyle ?? 'normal';
  }

  getTextFontSize(element: CanvasElement): string {
    return formatTextMetricValue(
      element.fontSize,
      element.fontSizeUnit ?? 'px',
      DEFAULT_TEXT_FONT_SIZE,
    );
  }

  getTextLineHeight(element: CanvasElement): string {
    return formatTextMetricValue(element.lineHeight, element.lineHeightUnit ?? 'em', 1.2);
  }

  getTextLetterSpacing(element: CanvasElement): string {
    return formatTextMetricValue(element.letterSpacing, element.letterSpacingUnit ?? 'px', 0);
  }

  getTextFontSizeInPixels(element: CanvasElement): number {
    const fontSize = Number.isFinite(element.fontSize ?? Number.NaN)
      ? (element.fontSize as number)
      : DEFAULT_TEXT_FONT_SIZE;

    return (element.fontSizeUnit ?? 'px') === 'rem' ? fontSize * ROOT_FONT_SIZE_PX : fontSize;
  }

  getTextJustifyContent(element: CanvasElement): string {
    switch (element.textAlign) {
      case 'left':
        return 'flex-start';
      case 'right':
        return 'flex-end';
      default:
        return 'center';
    }
  }

  getTextAlignItems(element: CanvasElement): string {
    switch (element.textVerticalAlign) {
      case 'top':
        return 'flex-start';
      case 'bottom':
        return 'flex-end';
      default:
        return 'center';
    }
  }

  getTextAlignValue(element: CanvasElement): string {
    return element.textAlign ?? 'center';
  }

  getFrameTitle(element: CanvasElement): string {
    const name = element.name?.trim() || 'Frame';
    const primary = element.isPrimary ? ' · Primary' : '';
    return `${name}${primary}  ${Math.round(element.width)} × ${Math.round(element.height)}`;
  }

  // ── Normalize / Remove Delegates ─────────────────────────

  normalizeElement(element: CanvasElement, elements: CanvasElement[]): void {
    mutateNormalizeElement(element, elements);
  }

  removeElementWithChildren(elements: CanvasElement[], rootId: string): CanvasElement[] {
    return removeWithChildren(elements, rootId);
  }
}

function formatTextMetricValue(
  value: number | undefined,
  unit: 'px' | 'rem' | 'em',
  fallback: number,
): string {
  const normalizedValue = Number.isFinite(value ?? Number.NaN) ? (value as number) : fallback;
  return `${normalizedValue}${unit}`;
}
