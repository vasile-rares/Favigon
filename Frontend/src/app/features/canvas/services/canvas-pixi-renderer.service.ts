import { Injectable, inject } from '@angular/core';
import { Container, Graphics, Text, TextStyle, Sprite, Assets, Texture } from 'pixi.js';
import { DropShadowFilter } from 'pixi-filters';
import { CanvasElement, CanvasCornerRadii, CanvasBorderWidths } from '@app/core';
import { CanvasPixiApplicationService } from './canvas-pixi-application.service';
import { CanvasPixiLayoutService, LayoutResult } from './canvas-pixi-layout.service';
import { CanvasElementService } from './canvas-element.service';
import {
  getResolvedCornerRadii,
  getStrokeWidths,
  hasPerCornerRadius,
  hasPerSideStrokeWidths,
  getStrokeWidth,
} from '../utils/canvas-interaction.util';
import { roundToTwoDecimals } from '../utils/canvas-math.util';
import { Bounds, FlowDragRenderState, PageCanvasLayout } from '../canvas.types';
import { parsePixiCssColor, parseShadowParams } from './canvas-pixi-shadow.util';

const MAX_TEXT_RENDER_RESOLUTION = 4;
const MAX_SHADOW_FILTER_RESOLUTION = 4;
const SHADOW_FILTER_QUALITY = 5;

interface PixiElementNode {
  container: Container;
  fillGraphics: Graphics;
  strokeGraphics: Graphics;
  strokeMaskGraphics: Graphics | null;
  textObj: Text | null;
  sprite: Sprite | null;
  maskGraphics: Graphics | null;
  shadowFilter: DropShadowFilter | null;
  lastHash: string;
}

@Injectable()
export class CanvasPixiRendererService {
  private readonly pixiApp = inject(CanvasPixiApplicationService);
  private readonly layoutService = inject(CanvasPixiLayoutService);
  private readonly elService = inject(CanvasElementService);

  /** Page shell containers keyed by pageId */
  private readonly pageContainers = new Map<string, Container>();

  /** Element pixi nodes keyed by element id */
  private readonly elementNodes = new Map<string, PixiElementNode>();

  /** Container that holds all page shells, lives inside sceneContainer */
  private readonly pagesRoot = new Container({ label: 'pages-root' });

  private initialized = false;

  /** Placeholder graphics drawn inside the layout container during flow drag */
  private placeholderGraphics: Graphics | null = null;
  private placeholderParentContainer: Container | null = null;

  init(): void {
    if (this.initialized) return;
    this.pixiApp.sceneContainer.addChild(this.pagesRoot);
    this.initialized = true;
  }

  // ── Full Sync ─────────────────────────────────────────────

  syncPages(
    pages: { pageId: string; elements: CanvasElement[]; layout: PageCanvasLayout }[],
    activePageId: string | null,
    flowDragState?: FlowDragRenderState | null,
    zoom = 1,
  ): void {
    if (!this.initialized) this.init();

    const activePageIds = new Set(pages.map((p) => p.pageId));

    // Remove stale page containers
    for (const [pageId, container] of this.pageContainers) {
      if (!activePageIds.has(pageId)) {
        this.pagesRoot.removeChild(container);
        container.destroy({ children: true });
        this.pageContainers.delete(pageId);
      }
    }

    // Clear placeholder from previous frame
    this.clearPlaceholder();

    for (const page of pages) {
      let pageContainer = this.pageContainers.get(page.pageId);
      if (!pageContainer) {
        pageContainer = new Container({ label: `page-${page.pageId}` });
        this.pagesRoot.addChild(pageContainer);
        this.pageContainers.set(page.pageId, pageContainer);
      }

      pageContainer.position.set(page.layout.x, page.layout.y);

      // Sync elements
      this.syncElements(page.elements, pageContainer, page.layout, flowDragState ?? null, zoom);
    }

    // Cleanup orphan element nodes
    this.cleanupOrphanElements(pages.flatMap((p) => p.elements));
  }

  // ── Element Sync ──────────────────────────────────────────

  private syncElements(
    elements: CanvasElement[],
    pageContainer: Container,
    layout: PageCanvasLayout,
    flowDragState: FlowDragRenderState | null,
    zoom: number,
  ): void {
    const visibleElements = elements.filter((el) =>
      this.elService.isElementEffectivelyVisible(el.id, elements),
    );

    // Build parent→children map
    const childrenMap = new Map<string | null, CanvasElement[]>();
    for (const el of visibleElements) {
      const parentKey = el.parentId ?? null;
      if (!childrenMap.has(parentKey)) childrenMap.set(parentKey, []);
      childrenMap.get(parentKey)!.push(el);
    }

    // Clear page container's element children
    pageContainer.removeChildren();

    // Render top-level elements recursively
    const topLevel = childrenMap.get(null) ?? [];
    for (const el of this.getRenderStackOrder(topLevel)) {
      const node = this.renderElement(
        el,
        elements,
        childrenMap,
        layout,
        undefined,
        flowDragState,
        zoom,
      );
      if (node) pageContainer.addChild(node.container);
    }

    // Render the dragged element floating at mouse position (on top of everything)
    if (flowDragState) {
      this.renderFloatingElement(flowDragState, elements, childrenMap, layout, pageContainer, zoom);
    }
  }

  private renderElement(
    element: CanvasElement,
    allElements: CanvasElement[],
    childrenMap: Map<string | null, CanvasElement[]>,
    layout: PageCanvasLayout,
    layoutOverride?: LayoutResult,
    flowDragState?: FlowDragRenderState | null,
    zoom = 1,
  ): PixiElementNode | null {
    // Skip the dragged element at its normal position — it renders floating instead
    if (flowDragState && element.id === flowDragState.draggingElementId) {
      return null;
    }

    const renderedWidth =
      layoutOverride?.width ?? this.elService.getRenderedWidth(element, allElements);
    const renderedHeight =
      layoutOverride?.height ?? this.elService.getRenderedHeight(element, allElements);
    const hash = this.computeElementHash(element, renderedWidth, renderedHeight);
    let node = this.elementNodes.get(element.id);

    if (node && node.lastHash === hash && !node.container.destroyed) {
      this.syncTextNodePresentation(node, element, renderedWidth, renderedHeight, zoom);
      this.syncShadowFilterPresentation(node, zoom);
      // Position may have changed — update position
      this.applyPosition(node, element, allElements, layout, layoutOverride);
      // Re-add children
      this.addChildElements(
        node,
        element,
        allElements,
        childrenMap,
        layout,
        { width: renderedWidth, height: renderedHeight },
        flowDragState,
        zoom,
      );
      return node;
    }

    // Create or recreate
    if (node && !node.container.destroyed) {
      node.container.destroy({ children: true });
    }

    node = this.createElementNode(element, allElements, layout, layoutOverride, zoom);
    node.lastHash = hash;
    this.elementNodes.set(element.id, node);

    // Apply transforms (sets pivot for rotated/scaled elements)
    this.applyTransforms(node, element);

    // Apply position after transforms so pivot compensation is correct
    this.applyPosition(node, element, allElements, layout, layoutOverride);

    // Add children for containers
    this.addChildElements(
      node,
      element,
      allElements,
      childrenMap,
      layout,
      { width: renderedWidth, height: renderedHeight },
      flowDragState,
      zoom,
    );

    return node;
  }

  private createElementNode(
    element: CanvasElement,
    allElements: CanvasElement[],
    layout: PageCanvasLayout,
    layoutOverride?: LayoutResult,
    zoom = 1,
  ): PixiElementNode {
    const container = new Container({ label: `el-${element.id}` });
    container.eventMode = 'static';
    container.cursor = 'default';
    (container as any).__canvasElementId = element.id;

    const fillGraphics = new Graphics();
    const strokeGraphics = new Graphics();
    container.addChild(fillGraphics);

    const width = layoutOverride?.width ?? this.elService.getRenderedWidth(element, allElements);
    const height = layoutOverride?.height ?? this.elService.getRenderedHeight(element, allElements);
    const contentBox = this.getElementContentBox(element, width, height);
    const cornerRadii = getResolvedCornerRadii(element);

    let textObj: Text | null = null;
    let sprite: Sprite | null = null;
    let strokeMaskGraphics: Graphics | null = null;
    let maskGraphics: Graphics | null = null;
    let shadowFilter: DropShadowFilter | null = null;

    // Fill
    if (element.type !== 'text' && element.type !== 'image') {
      if (element.fillMode === 'image' && element.backgroundImage) {
        const objectFit = element.objectFit ?? 'cover';
        if (objectFit !== 'contain') {
          // Keep a temporary backdrop only for modes that fully cover the box.
          this.drawRoundedRect(fillGraphics, 0, 0, width, height, cornerRadii, '#1a1a1a');
        } else {
          // Preserve the element's full box for hover/selection overlays without visible bars.
          this.drawRoundedRect(
            fillGraphics,
            0,
            0,
            width,
            height,
            cornerRadii,
            'rgba(255,255,255,0)',
          );
        }
        sprite = new Sprite();
        this.addImageFillSpriteToContainer(sprite, element, width, height, cornerRadii, container);
        const capturedSprite = sprite;
        const backgroundPosition = element.backgroundPosition ?? 'center';
        this.loadImageTexture(element.backgroundImage, capturedSprite, (tex) => {
          if (!capturedSprite.destroyed) {
            this.applySpriteObjectFit(
              capturedSprite,
              objectFit,
              backgroundPosition,
              tex,
              width,
              height,
            );
          }
        });
      } else {
        const fillColor = element.fill || (element.type === 'frame' ? '#3f3f46' : '#e0e0e0');
        this.drawRoundedRect(fillGraphics, 0, 0, width, height, cornerRadii, fillColor);
      }
    }

    // Stroke
    if (element.stroke && element.type !== 'text') {
      if (hasPerSideStrokeWidths(element)) {
        const strokeWidths = getStrokeWidths(element);
        this.drawPerSideRectStroke(
          strokeGraphics,
          0,
          0,
          width,
          height,
          element.stroke,
          strokeWidths,
        );
        strokeMaskGraphics = new Graphics();
        this.drawRoundedRect(strokeMaskGraphics, 0, 0, width, height, cornerRadii, '#ffffff');
        strokeGraphics.mask = strokeMaskGraphics;
        container.addChild(strokeGraphics);
        container.addChild(strokeMaskGraphics);
      } else {
        const sw = getStrokeWidth(element);
        if (sw > 0) {
          this.drawRoundedRectStroke(
            strokeGraphics,
            0,
            0,
            width,
            height,
            cornerRadii,
            element.stroke,
            sw,
          );
          container.addChild(strokeGraphics);
        }
      }
    }

    // Shadow
    if (element.shadow) {
      const shadowParams = parseShadowParams(element.shadow);
      if (shadowParams) {
        shadowFilter = new DropShadowFilter({
          offset: { x: shadowParams.x, y: shadowParams.y },
          blur: shadowParams.blur,
          color: shadowParams.color,
          alpha: shadowParams.alpha,
          quality: SHADOW_FILTER_QUALITY,
          resolution: this.getShadowFilterResolution(zoom),
        });
        this.configureShadowFilter(shadowFilter, shadowParams, zoom);
        container.filters = [shadowFilter];
      }
    }

    // Text
    if (element.type === 'text') {
      // Create an invisible text box so bounds/outline use the component box,
      // not the glyph bounds of the rendered text.
      fillGraphics.rect(0, 0, width, height);
      fillGraphics.fill({ color: 0xffffff, alpha: 0 });

      const style = new TextStyle({
        fontFamily: element.fontFamily || 'Inter',
        fontSize: element.fontSize || 16,
        fontWeight: (element.fontWeight?.toString() as any) || '400',
        fontStyle: element.fontStyle || 'normal',
        fill: element.fill || '#000000',
        wordWrap: true,
        wordWrapWidth: Math.max(contentBox.width, 1),
        align: element.textAlign || 'left',
        lineHeight: this.resolveLineHeight(element),
        letterSpacing: element.letterSpacing || 0,
      });
      textObj = new Text({
        text: element.text || '',
        style,
        resolution: this.getTextRenderResolution(zoom),
        roundPixels: true,
      });
      textObj.anchor.set(0, 0);
      this.syncTextNodePresentation(
        {
          container,
          fillGraphics,
          strokeGraphics,
          strokeMaskGraphics,
          textObj,
          sprite,
          maskGraphics,
          shadowFilter,
          lastHash: '',
        },
        element,
        width,
        height,
        zoom,
      );
      container.addChild(textObj);
    }

    // Image
    if (element.type === 'image' && element.imageUrl) {
      sprite = new Sprite();
      sprite.position.set(contentBox.x, contentBox.y);
      sprite.width = contentBox.width;
      sprite.height = contentBox.height;
      container.addChild(sprite);

      // Apply corner radius mask for images
      if ((element.cornerRadius ?? 0) > 0 || hasPerCornerRadius(element)) {
        maskGraphics = new Graphics();
        this.drawRoundedRect(maskGraphics, 0, 0, width, height, cornerRadii, '#ffffff');
        container.addChild(maskGraphics);
        sprite.mask = maskGraphics;
      }

      // Load texture asynchronously
      this.loadImageTexture(element.imageUrl, sprite);
    }

    // Opacity
    container.alpha = element.opacity ?? 1;

    // Overflow (clip children for containers)
    // Containers clip children for clipping overflow modes and allow spill for visible.
    const shouldClip =
      this.elService.isContainerElement(element) &&
      (element.overflow === 'clip' ||
        element.overflow === 'hidden' ||
        element.overflow === 'scroll');
    if (shouldClip) {
      const clipMask = new Graphics();
      this.drawRoundedRect(clipMask, 0, 0, width, height, cornerRadii, '#ffffff');
      container.addChild(clipMask);
      container.mask = clipMask;
    }

    return {
      container,
      fillGraphics,
      strokeGraphics,
      strokeMaskGraphics,
      textObj,
      sprite,
      maskGraphics,
      shadowFilter,
      lastHash: '',
    };
  }

  private applyPosition(
    node: PixiElementNode,
    element: CanvasElement,
    allElements: CanvasElement[],
    layout: PageCanvasLayout,
    layoutOverride?: LayoutResult,
  ): void {
    let x: number;
    let y: number;
    if (layoutOverride) {
      x = layoutOverride.x;
      y = layoutOverride.y;
    } else {
      x = element.x;
      y = element.y;
    }
    // Compensate for pivot so the element renders at its intended (x, y)
    node.container.position.set(x + node.container.pivot.x, y + node.container.pivot.y);
  }

  private applyTransforms(node: PixiElementNode, element: CanvasElement): void {
    const rotation = element.rotation ?? 0;
    node.container.rotation = (rotation * Math.PI) / 180;

    const scaleX = element.scaleX ?? 1;
    const scaleY = element.scaleY ?? 1;
    if (scaleX !== 1 || scaleY !== 1) {
      node.container.scale.set(scaleX, scaleY);
    }

    const skewX = element.skewX ?? 0;
    const skewY = element.skewY ?? 0;
    if (skewX !== 0 || skewY !== 0) {
      node.container.skew.set((skewX * Math.PI) / 180, (skewY * Math.PI) / 180);
    }

    // Only set pivot (transform origin) when there's an actual transform
    const hasTransform =
      rotation !== 0 || scaleX !== 1 || scaleY !== 1 || skewX !== 0 || skewY !== 0;
    if (hasTransform) {
      const originX = (element.transformOriginX ?? 50) / 100;
      const originY = (element.transformOriginY ?? 50) / 100;
      const width = node.fillGraphics.width || element.width;
      const height = node.fillGraphics.height || element.height;
      node.container.pivot.set(width * originX, height * originY);
      // Position compensation is handled by applyPosition
    }
  }

  private addChildElements(
    node: PixiElementNode,
    element: CanvasElement,
    allElements: CanvasElement[],
    childrenMap: Map<string | null, CanvasElement[]>,
    layout: PageCanvasLayout,
    containerSize: { width: number; height: number },
    flowDragState?: FlowDragRenderState | null,
    zoom = 1,
  ): void {
    if (!this.elService.isContainerElement(element)) return;

    const children = childrenMap.get(element.id) ?? [];
    const isPlaceholderContainer =
      flowDragState?.placeholder && element.id === flowDragState.placeholder.containerId;

    // Compute layout for flex/grid containers
    let layoutResults: Map<string, LayoutResult> | null = null;
    if (this.elService.isLayoutContainerElement(element)) {
      if (isPlaceholderContainer) {
        // Compute layout with a virtual placeholder element inserted at the drop index
        layoutResults = this.computeLayoutWithPlaceholder(
          element,
          children,
          allElements,
          containerSize,
          flowDragState!,
        );
      } else {
        // Exclude dragged element from layout computation if it's a child of this container
        const filteredChildren = flowDragState
          ? children.filter((c) => c.id !== flowDragState.draggingElementId)
          : children;
        layoutResults = this.layoutService.computeLayout(
          element,
          filteredChildren,
          allElements,
          containerSize,
        );
      }
    }

    for (const child of this.getRenderStackOrder(children)) {
      // Skip dragged element — it renders floating
      if (flowDragState && child.id === flowDragState.draggingElementId) continue;

      const childLayout = layoutResults?.get(child.id);
      const childNode = this.renderElement(
        child,
        allElements,
        childrenMap,
        layout,
        childLayout,
        flowDragState,
        zoom,
      );
      if (childNode) {
        node.container.addChild(childNode.container);
      }
    }

    // Draw placeholder inside this container
    if (isPlaceholderContainer && layoutResults) {
      this.drawFlowPlaceholder(node, layoutResults, flowDragState!, allElements);
    }
  }

  // ── Flow-Drag Helpers ─────────────────────────────────────

  private static readonly PLACEHOLDER_ID = '__drag-placeholder__';

  /**
   * Renders the dragged element at its floating mouse position on top of everything.
   */
  private renderFloatingElement(
    flowDragState: FlowDragRenderState,
    elements: CanvasElement[],
    childrenMap: Map<string | null, CanvasElement[]>,
    layout: PageCanvasLayout,
    pageContainer: Container,
    zoom: number,
  ): void {
    const draggedEl = elements.find((e) => e.id === flowDragState.draggingElementId);
    if (!draggedEl) return;

    // Convert scene-space floating bounds to page-local coords
    const floatX = flowDragState.floatingBounds.x - layout.x;
    const floatY = flowDragState.floatingBounds.y - layout.y;
    const floatingOverride: LayoutResult = {
      x: floatX,
      y: floatY,
      width: flowDragState.floatingBounds.width,
      height: flowDragState.floatingBounds.height,
    };

    // Render the element fully (with children) — passing null for flowDragState
    // so its own children render normally, not in flow-drag mode
    const node = this.renderElementForFloating(
      draggedEl,
      elements,
      childrenMap,
      layout,
      floatingOverride,
      zoom,
    );
    if (node) {
      pageContainer.addChild(node.container);
    }
  }

  /**
   * Dedicated render path for the floating element so it doesn't skip itself via flowDragState.
   */
  private renderElementForFloating(
    element: CanvasElement,
    allElements: CanvasElement[],
    childrenMap: Map<string | null, CanvasElement[]>,
    layout: PageCanvasLayout,
    layoutOverride: LayoutResult,
    zoom: number,
  ): PixiElementNode | null {
    const hash = this.computeElementHash(element, layoutOverride.width, layoutOverride.height);
    let node = this.elementNodes.get(element.id);

    if (node && node.lastHash === hash && !node.container.destroyed) {
      this.syncTextNodePresentation(
        node,
        element,
        layoutOverride.width,
        layoutOverride.height,
        zoom,
      );
      this.syncShadowFilterPresentation(node, zoom);
      this.applyPosition(node, element, allElements, layout, layoutOverride);
      this.addChildElements(
        node,
        element,
        allElements,
        childrenMap,
        layout,
        { width: layoutOverride.width, height: layoutOverride.height },
        undefined,
        zoom,
      );
      return node;
    }

    if (node && !node.container.destroyed) {
      node.container.destroy({ children: true });
    }

    node = this.createElementNode(element, allElements, layout, layoutOverride, zoom);
    node.lastHash = hash;
    this.elementNodes.set(element.id, node);

    this.applyTransforms(node, element);
    this.applyPosition(node, element, allElements, layout, layoutOverride);
    this.addChildElements(
      node,
      element,
      allElements,
      childrenMap,
      layout,
      { width: layoutOverride.width, height: layoutOverride.height },
      undefined,
      zoom,
    );

    return node;
  }

  private getRenderStackOrder(elements: CanvasElement[]): CanvasElement[] {
    return [...elements].reverse();
  }

  private syncTextNodePresentation(
    node: PixiElementNode,
    element: CanvasElement,
    width: number,
    height: number,
    zoom: number,
  ): void {
    const textObj = node.textObj;
    if (!textObj || textObj.destroyed) {
      return;
    }

    const targetResolution = this.getTextRenderResolution(zoom);
    if (Math.abs(textObj.resolution - targetResolution) > 0.001) {
      textObj.resolution = targetResolution;
    }

    textObj.roundPixels = true;
    textObj.style.wordWrap = true;
    const contentBox = this.getElementContentBox(element, width, height);
    textObj.style.wordWrapWidth = Math.max(contentBox.width, 1);
    textObj.style.align = element.textAlign || 'left';

    const localBounds = textObj.getLocalBounds();
    const textX =
      contentBox.x + this.getTextHorizontalOffset(element, contentBox.width, localBounds.width);
    const textY =
      contentBox.y + this.getTextVerticalOffset(element, contentBox.height, localBounds.height);

    textObj.position.set(
      roundToTwoDecimals(textX - localBounds.x),
      roundToTwoDecimals(textY - localBounds.y),
    );
  }

  private syncShadowFilterPresentation(node: PixiElementNode, zoom: number): void {
    const shadowFilter = node.shadowFilter;
    if (!shadowFilter) {
      return;
    }

    shadowFilter.resolution = this.getShadowFilterResolution(zoom);
    shadowFilter.quality = SHADOW_FILTER_QUALITY;
    shadowFilter.antialias = 'on';
  }

  private configureShadowFilter(
    shadowFilter: DropShadowFilter,
    shadowParams: { x: number; y: number; blur: number; color: number; alpha: number },
    zoom: number,
  ): void {
    shadowFilter.offset = { x: shadowParams.x, y: shadowParams.y };
    shadowFilter.blur = shadowParams.blur;
    shadowFilter.color = shadowParams.color;
    shadowFilter.alpha = shadowParams.alpha;
    shadowFilter.quality = SHADOW_FILTER_QUALITY;
    shadowFilter.resolution = this.getShadowFilterResolution(zoom);
    shadowFilter.antialias = 'on';
    shadowFilter.padding = Math.ceil(
      shadowParams.blur * 2 + Math.max(Math.abs(shadowParams.x), Math.abs(shadowParams.y)),
    );
  }

  private getTextRenderResolution(zoom: number): number {
    const rendererResolution =
      this.pixiApp.pixiApp?.renderer.resolution ?? window.devicePixelRatio ?? 1;
    return Math.max(
      rendererResolution,
      Math.min(MAX_TEXT_RENDER_RESOLUTION, rendererResolution * Math.max(1, zoom)),
    );
  }

  private getShadowFilterResolution(zoom: number): number {
    const rendererResolution =
      this.pixiApp.pixiApp?.renderer.resolution ?? window.devicePixelRatio ?? 1;
    return Math.max(
      rendererResolution,
      Math.min(MAX_SHADOW_FILTER_RESOLUTION, rendererResolution * Math.max(1, zoom)),
    );
  }

  private getElementContentBox(
    element: CanvasElement,
    width: number,
    height: number,
  ): { x: number; y: number; width: number; height: number } {
    const padding = element.padding;
    const left = padding?.left ?? 0;
    const top = padding?.top ?? 0;
    const right = padding?.right ?? 0;
    const bottom = padding?.bottom ?? 0;

    return {
      x: left,
      y: top,
      width: Math.max(0, width - left - right),
      height: Math.max(0, height - top - bottom),
    };
  }

  private getTextHorizontalOffset(
    element: CanvasElement,
    width: number,
    textWidth: number,
  ): number {
    switch (element.textAlign) {
      case 'right':
        return width - textWidth;
      case 'center':
        return (width - textWidth) / 2;
      default:
        return 0;
    }
  }

  private getTextVerticalOffset(
    element: CanvasElement,
    height: number,
    textHeight: number,
  ): number {
    switch (element.textVerticalAlign) {
      case 'bottom':
        return height - textHeight;
      case 'middle':
        return (height - textHeight) / 2;
      default:
        return 0;
    }
  }

  /**
   * Builds a virtual children list with a placeholder element at the drop index,
   * then runs yoga layout on it. The placeholder gets the dragged element's dimensions.
   */
  private computeLayoutWithPlaceholder(
    container: CanvasElement,
    children: CanvasElement[],
    allElements: CanvasElement[],
    containerSize: { width: number; height: number },
    flowDragState: FlowDragRenderState,
  ): Map<string, LayoutResult> {
    const draggedEl = allElements.find((e) => e.id === flowDragState.draggingElementId);
    const dropIndex = flowDragState.placeholder!.dropIndex;

    // Separate flow children (excluding dragged) and absolute children
    const flowChildren: CanvasElement[] = [];
    const absChildren: CanvasElement[] = [];
    for (const child of children) {
      if (child.id === flowDragState.draggingElementId) continue;
      const pos = child.position;
      const isFlow = !pos || pos === 'static' || pos === 'relative' || pos === 'sticky';
      if (isFlow) {
        flowChildren.push(child);
      } else {
        absChildren.push(child);
      }
    }

    // Create a virtual placeholder element with the dragged element's size
    const placeholderEl: CanvasElement = {
      id: CanvasPixiRendererService.PLACEHOLDER_ID,
      type: draggedEl?.type ?? 'rectangle',
      x: 0,
      y: 0,
      width: draggedEl?.width ?? flowDragState.floatingBounds.width,
      height: draggedEl?.height ?? flowDragState.floatingBounds.height,
      parentId: container.id,
      margin: draggedEl?.margin,
      widthMode: draggedEl?.widthMode,
      heightMode: draggedEl?.heightMode,
      minWidth: draggedEl?.minWidth,
      maxWidth: draggedEl?.maxWidth,
      minHeight: draggedEl?.minHeight,
      maxHeight: draggedEl?.maxHeight,
    } as CanvasElement;

    // Insert placeholder at drop index in flow children
    const virtualFlowChildren = [...flowChildren];
    const clampedIndex = Math.min(dropIndex, virtualFlowChildren.length);
    virtualFlowChildren.splice(clampedIndex, 0, placeholderEl);

    // Run yoga layout on combined list
    return this.layoutService.computeLayout(
      container,
      [...virtualFlowChildren, ...absChildren],
      allElements,
      containerSize,
    );
  }

  /**
   * Draws a semi-transparent placeholder rect at the yoga-computed position
   * inside the layout container.
   */
  private drawFlowPlaceholder(
    parentNode: PixiElementNode,
    layoutResults: Map<string, LayoutResult>,
    flowDragState: FlowDragRenderState,
    allElements: CanvasElement[],
  ): void {
    const placeholderLayout = layoutResults.get(CanvasPixiRendererService.PLACEHOLDER_ID);
    if (!placeholderLayout) return;

    const draggedEl = allElements.find((e) => e.id === flowDragState.draggingElementId);
    const cornerRadius = draggedEl?.cornerRadius ?? 0;
    const maxR = Math.min(placeholderLayout.width / 2, placeholderLayout.height / 2);
    const r = Math.min(cornerRadius, maxR);

    const g = new Graphics();

    if (r > 0) {
      g.roundRect(
        placeholderLayout.x,
        placeholderLayout.y,
        placeholderLayout.width,
        placeholderLayout.height,
        r,
      );
    } else {
      g.rect(
        placeholderLayout.x,
        placeholderLayout.y,
        placeholderLayout.width,
        placeholderLayout.height,
      );
    }

    g.fill({ color: 0x3b82f6, alpha: 0.15 });
    g.stroke({ width: 1.5, color: 0x3b82f6, alpha: 0.7 });

    parentNode.container.addChild(g);
    this.placeholderGraphics = g;
    this.placeholderParentContainer = parentNode.container;
  }

  /**
   * Removes any existing placeholder graphics from the previous frame.
   */
  private clearPlaceholder(): void {
    if (this.placeholderGraphics) {
      if (this.placeholderParentContainer && !this.placeholderParentContainer.destroyed) {
        this.placeholderParentContainer.removeChild(this.placeholderGraphics);
      }
      if (!this.placeholderGraphics.destroyed) {
        this.placeholderGraphics.destroy();
      }
      this.placeholderGraphics = null;
      this.placeholderParentContainer = null;
    }
  }

  // ── Drawing Helpers ───────────────────────────────────────

  private drawRoundedRect(
    g: Graphics,
    x: number,
    y: number,
    w: number,
    h: number,
    radii: CanvasCornerRadii,
    fillColor: string,
  ): void {
    const { topLeft, topRight, bottomRight, bottomLeft } = radii;
    const maxR = Math.min(w / 2, h / 2);
    const tl = Math.min(topLeft, maxR);
    const tr = Math.min(topRight, maxR);
    const br = Math.min(bottomRight, maxR);
    const bl = Math.min(bottomLeft, maxR);

    g.clear();

    let fill: { color: number; alpha: number };
    try {
      fill = parsePixiCssColor(fillColor);
    } catch {
      fill = { color: 0xe0e0e0, alpha: 1 };
    }

    if (tl === 0 && tr === 0 && br === 0 && bl === 0) {
      g.rect(x, y, w, h);
    } else if (tl === tr && tr === br && br === bl) {
      g.roundRect(x, y, w, h, tl);
    } else {
      // Per-corner radii via manual path
      g.moveTo(x + tl, y);
      g.lineTo(x + w - tr, y);
      if (tr > 0) g.arcTo(x + w, y, x + w, y + tr, tr);
      else g.lineTo(x + w, y);
      g.lineTo(x + w, y + h - br);
      if (br > 0) g.arcTo(x + w, y + h, x + w - br, y + h, br);
      else g.lineTo(x + w, y + h);
      g.lineTo(x + bl, y + h);
      if (bl > 0) g.arcTo(x, y + h, x, y + h - bl, bl);
      else g.lineTo(x, y + h);
      g.lineTo(x, y + tl);
      if (tl > 0) g.arcTo(x, y, x + tl, y, tl);
      else g.lineTo(x, y);
      g.closePath();
    }

    g.fill(fill);
  }

  private drawRoundedRectStroke(
    g: Graphics,
    x: number,
    y: number,
    w: number,
    h: number,
    radii: CanvasCornerRadii,
    strokeColor: string,
    strokeWidth: number,
  ): void {
    const { topLeft, topRight, bottomRight, bottomLeft } = radii;
    const maxR = Math.min(w / 2, h / 2);
    const tl = Math.min(topLeft, maxR);
    const tr = Math.min(topRight, maxR);
    const br = Math.min(bottomRight, maxR);
    const bl = Math.min(bottomLeft, maxR);

    g.clear();

    let stroke: { color: number; alpha: number };
    try {
      stroke = parsePixiCssColor(strokeColor);
    } catch {
      stroke = { color: 0x000000, alpha: 1 };
    }

    if (tl === 0 && tr === 0 && br === 0 && bl === 0) {
      g.rect(x, y, w, h);
    } else if (tl === tr && tr === br && br === bl) {
      g.roundRect(x, y, w, h, tl);
    } else {
      g.moveTo(x + tl, y);
      g.lineTo(x + w - tr, y);
      if (tr > 0) g.arcTo(x + w, y, x + w, y + tr, tr);
      else g.lineTo(x + w, y);
      g.lineTo(x + w, y + h - br);
      if (br > 0) g.arcTo(x + w, y + h, x + w - br, y + h, br);
      else g.lineTo(x + w, y + h);
      g.lineTo(x + bl, y + h);
      if (bl > 0) g.arcTo(x, y + h, x, y + h - bl, bl);
      else g.lineTo(x, y + h);
      g.lineTo(x, y + tl);
      if (tl > 0) g.arcTo(x, y, x + tl, y, tl);
      else g.lineTo(x, y);
      g.closePath();
    }

    g.stroke({ width: strokeWidth, color: stroke.color, alpha: stroke.alpha, alignment: 1 });
  }

  private drawPerSideRectStroke(
    g: Graphics,
    x: number,
    y: number,
    w: number,
    h: number,
    strokeColor: string,
    strokeWidths: CanvasBorderWidths,
  ): void {
    g.clear();

    let stroke: { color: number; alpha: number };
    try {
      stroke = parsePixiCssColor(strokeColor);
    } catch {
      stroke = { color: 0x000000, alpha: 1 };
    }

    const top = Math.min(Math.max(0, strokeWidths.top), h);
    const right = Math.min(Math.max(0, strokeWidths.right), w);
    const bottom = Math.min(Math.max(0, strokeWidths.bottom), h);
    const left = Math.min(Math.max(0, strokeWidths.left), w);

    if (top > 0) {
      g.rect(x, y, w, top);
    }

    if (right > 0) {
      g.rect(x + w - right, y, right, h);
    }

    if (bottom > 0) {
      g.rect(x, y + h - bottom, w, bottom);
    }

    if (left > 0) {
      g.rect(x, y, left, h);
    }

    g.fill({ color: stroke.color, alpha: stroke.alpha });
  }

  // ── Image Fill (background-image on frame/rectangle) ─────

  /**
   * Adds the sprite for an image-fill element to its container, with an optional
   * corner-radius mask. Sizing is deferred until the texture loads via the
   * loadImageTexture callback.
   */
  private addImageFillSpriteToContainer(
    sprite: Sprite,
    element: CanvasElement,
    width: number,
    height: number,
    cornerRadii: ReturnType<typeof getResolvedCornerRadii>,
    container: Container,
  ): void {
    // Clip to element shape with a mask
    if ((element.cornerRadius ?? 0) > 0 || hasPerCornerRadius(element)) {
      const mask = new Graphics();
      this.drawRoundedRect(mask, 0, 0, width, height, cornerRadii, '#ffffff');
      container.addChild(mask);
      sprite.mask = mask;
    }
    container.addChild(sprite);
  }

  /**
   * Sizes and positions a sprite according to CSS object-fit + background-position semantics.
   * Must be called AFTER the texture is loaded so texture dimensions are known.
   */
  private applySpriteObjectFit(
    sprite: Sprite,
    objectFit: string,
    backgroundPosition: string,
    tex: Texture,
    width: number,
    height: number,
  ): void {
    const tw = tex.width;
    const th = tex.height;
    if (!tw || !th) return;

    if (objectFit === 'cover') {
      const scale = Math.max(width / tw, height / th);
      const sw = tw * scale;
      const sh = th * scale;
      sprite.scale.set(scale);
      const [ox, oy] = this.resolvePositionOffset(backgroundPosition, width, height, sw, sh);
      sprite.position.set(ox, oy);
    } else if (objectFit === 'contain') {
      const scale = Math.min(width / tw, height / th);
      const sw = tw * scale;
      const sh = th * scale;
      sprite.scale.set(scale);
      // For contain, position only matters when there's letterboxing space
      const [ox, oy] = this.resolvePositionOffset(backgroundPosition, width, height, sw, sh);
      sprite.position.set(ox, oy);
    } else {
      // fill / stretch — distort to exactly fit the box; position has no effect
      sprite.scale.set(width / tw, height / th);
      sprite.position.set(0, 0);
    }
  }

  /**
   * Translates a CSS background-position keyword into a pixel offset for the sprite.
   * Returns [x, y] where (0,0) = top-left.
   */
  private resolvePositionOffset(
    position: string,
    boxW: number,
    boxH: number,
    spriteW: number,
    spriteH: number,
  ): [number, number] {
    const overflowX = boxW - spriteW; // negative = image wider than box (crop)
    const overflowY = boxH - spriteH;

    const h = position.includes('left')
      ? 0
      : position.includes('right')
        ? overflowX
        : overflowX / 2; // center (default)

    const v = position.includes('top')
      ? 0
      : position.includes('bottom')
        ? overflowY
        : overflowY / 2; // center (default)

    return [h, v];
  }

  // ── Image Loading ─────────────────────────────────────────

  private async loadImageTexture(
    url: string,
    sprite: Sprite,
    onLoaded?: (tex: Texture) => void,
  ): Promise<void> {
    try {
      const texture = await Assets.load<Texture>(url);
      if (sprite.destroyed) return;
      sprite.texture = texture;
      onLoaded?.(texture);
    } catch {
      // Failed to load image — leave sprite blank
    }
  }

  // ── Line Height Resolution ────────────────────────────────

  private resolveLineHeight(element: CanvasElement): number {
    const fontSize = element.fontSize || 16;
    const lh = element.lineHeight ?? 1.2;
    const unit = element.lineHeightUnit || 'em';
    return unit === 'em' ? lh * fontSize : lh;
  }

  // ── Hashing ───────────────────────────────────────────────

  private computeElementHash(
    el: CanvasElement,
    renderedWidth: number,
    renderedHeight: number,
  ): string {
    return JSON.stringify({
      x: el.x,
      y: el.y,
      w: renderedWidth,
      h: renderedHeight,
      fill: el.fill,
      stroke: el.stroke,
      strokeWidth: el.strokeWidth,
      strokeSides: el.strokeSides,
      strokeWidths: el.strokeWidths,
      strokeStyle: el.strokeStyle,
      opacity: el.opacity,
      cornerRadius: el.cornerRadius,
      cornerRadii: el.cornerRadii,
      rotation: el.rotation,
      scaleX: el.scaleX,
      scaleY: el.scaleY,
      skewX: el.skewX,
      skewY: el.skewY,
      text: el.text,
      fontSize: el.fontSize,
      fontFamily: el.fontFamily,
      fontWeight: el.fontWeight,
      fontStyle: el.fontStyle,
      textAlign: el.textAlign,
      textVerticalAlign: el.textVerticalAlign,
      lineHeight: el.lineHeight,
      letterSpacing: el.letterSpacing,
      imageUrl: el.imageUrl,
      shadow: el.shadow,
      overflow: el.overflow,
      visible: el.visible,
      display: el.display,
      widthMode: el.widthMode,
      heightMode: el.heightMode,
      transformOriginX: el.transformOriginX,
      transformOriginY: el.transformOriginY,
      parentId: el.parentId,
      position: el.position,
      flexDirection: el.flexDirection,
      flexWrap: el.flexWrap,
      justifyContent: el.justifyContent,
      alignItems: el.alignItems,
      gap: el.gap,
      gapX: el.gapX,
      gapY: el.gapY,
      padding: el.padding,
      margin: el.margin,
      gridTemplateColumns: el.gridTemplateColumns,
      gridTemplateRows: el.gridTemplateRows,
      fillMode: el.fillMode,
      backgroundImage: el.backgroundImage,
      backgroundSize: el.backgroundSize,
      backgroundPosition: el.backgroundPosition,
      objectFit: el.objectFit,
    });
  }

  // ── Cleanup ───────────────────────────────────────────────

  private cleanupOrphanElements(allElements: CanvasElement[]): void {
    const activeIds = new Set(allElements.map((el) => el.id));
    for (const [id, node] of this.elementNodes) {
      if (!activeIds.has(id)) {
        node.container.destroy({ children: true });
        this.elementNodes.delete(id);
      }
    }
  }

  // ── Public Queries ────────────────────────────────────────

  getContainerForElement(elementId: string): Container | null {
    return this.elementNodes.get(elementId)?.container ?? null;
  }

  /** Returns the rendered pixel size of an element as it appears on the canvas. */
  getRenderedNodeSize(elementId: string): { width: number; height: number } | null {
    const node = this.elementNodes.get(elementId);
    if (!node || node.container.destroyed) return null;

    if (
      !node.fillGraphics.destroyed &&
      node.fillGraphics.width > 0 &&
      node.fillGraphics.height > 0
    ) {
      return { width: node.fillGraphics.width, height: node.fillGraphics.height };
    }

    if (node.sprite && !node.sprite.destroyed) {
      return { width: node.sprite.width, height: node.sprite.height };
    }

    if (node.textObj && !node.textObj.destroyed) {
      return { width: node.textObj.width, height: node.textObj.height };
    }

    return { width: node.fillGraphics.width, height: node.fillGraphics.height };
  }

  getRenderedNodeSceneBounds(elementId: string): Bounds | null {
    const node = this.elementNodes.get(elementId);
    if (!node || node.container.destroyed) {
      return null;
    }

    const renderable =
      (!node.fillGraphics.destroyed && node.fillGraphics.width > 0 && node.fillGraphics.height > 0
        ? node.fillGraphics
        : null) ??
      (node.sprite && !node.sprite.destroyed ? node.sprite : null) ??
      (node.textObj && !node.textObj.destroyed ? node.textObj : null);

    if (!renderable) {
      return null;
    }

    const globalBounds = renderable.getBounds();
    const topLeft = this.pixiApp.sceneContainer.toLocal({
      x: globalBounds.x,
      y: globalBounds.y,
    });
    const bottomRight = this.pixiApp.sceneContainer.toLocal({
      x: globalBounds.x + globalBounds.width,
      y: globalBounds.y + globalBounds.height,
    });

    return {
      x: roundToTwoDecimals(topLeft.x),
      y: roundToTwoDecimals(topLeft.y),
      width: roundToTwoDecimals(bottomRight.x - topLeft.x),
      height: roundToTwoDecimals(bottomRight.y - topLeft.y),
    };
  }

  setEditingTextElementId(elementId: string | null): void {
    for (const [id, node] of this.elementNodes) {
      if (!node.textObj || node.container.destroyed) {
        continue;
      }

      node.container.visible = id !== elementId;
    }
  }

  /** Find the CanvasElement id from a PIXI Container (walks up ancestors). */
  getElementIdFromTarget(target: Container | null): string | null {
    let current = target;
    while (current) {
      const id = (current as any).__canvasElementId;
      if (typeof id === 'string') return id;
      current = current.parent ?? null;
    }
    return null;
  }

  destroy(): void {
    this.clearPlaceholder();

    for (const [, node] of this.elementNodes) {
      node.container.destroy({ children: true });
    }
    this.elementNodes.clear();

    for (const [, container] of this.pageContainers) {
      container.destroy({ children: true });
    }
    this.pageContainers.clear();

    this.pagesRoot.destroy({ children: true });
    this.initialized = false;
  }
}
