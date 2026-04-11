import { Injectable, inject } from '@angular/core';
import {
  loadYoga,
  type Yoga,
  type Node as YogaNode,
  type Config as YogaConfig,
} from 'yoga-layout/load';
import {
  FlexDirection,
  Justify,
  Align,
  Wrap,
  Display,
  PositionType,
  Edge,
  Gutter,
  Overflow,
} from 'yoga-layout/load';
import {
  CanvasElement,
  CanvasFlexDirection,
  CanvasJustifyContent,
  CanvasAlignItems,
  CanvasFlexWrap,
  CanvasPositionMode,
} from '@app/core';
import { CanvasElementService } from './canvas-element.service';

export interface LayoutResult {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface LayoutContainerSize {
  width: number;
  height: number;
}

@Injectable()
export class CanvasPixiLayoutService {
  private readonly elService = inject(CanvasElementService);
  private yoga: Yoga | null = null;
  private config: YogaConfig | null = null;
  private initPromise: Promise<void> | null = null;

  /** Must be called once before computeLayout. */
  async init(): Promise<void> {
    if (this.yoga) return;
    if (this.initPromise) return this.initPromise;
    this.initPromise = loadYoga().then((y) => {
      this.yoga = y;
      this.config = y.Config.create();
    });
    return this.initPromise;
  }

  /**
   * Computes layout for all flow children of a container element.
   * Returns a map of elementId → computed {x, y, width, height} relative to the container.
   * Absolute/fixed positioned children are NOT laid out by yoga — they keep their raw x/y.
   */
  computeLayout(
    container: CanvasElement,
    children: CanvasElement[],
    allElements: CanvasElement[],
    containerSize?: LayoutContainerSize,
  ): Map<string, LayoutResult> {
    const results = new Map<string, LayoutResult>();

    if (!this.elService.isLayoutContainerElement(container)) {
      return results;
    }

    if (!this.yoga || !this.config) {
      return results;
    }

    const yoga = this.yoga;
    const config = this.config;
    const rootNode = yoga.Node.create(config);

    // Configure root (container)
    const containerWidth =
      containerSize?.width ?? this.elService.getRenderedWidth(container, allElements);
    const containerHeight =
      containerSize?.height ?? this.elService.getRenderedHeight(container, allElements);
    rootNode.setWidth(containerWidth);
    rootNode.setHeight(containerHeight);
    rootNode.setDisplay(Display.Flex);

    // Flex properties
    if (container.display === 'flex') {
      rootNode.setFlexDirection(mapFlexDirection(container.flexDirection));
      rootNode.setJustifyContent(mapJustifyContent(container.justifyContent));
      rootNode.setAlignItems(mapAlignItems(container.alignItems));
      // Mirror align-items as align-content so wrapped flex lines behave consistently
      // (e.g. "center" means centered whether items are on one line or many).
      rootNode.setAlignContent(mapAlignItems(container.alignItems));
      rootNode.setFlexWrap(mapFlexWrap(container.flexWrap));
    } else if (container.display === 'grid') {
      // Yoga doesn't support CSS Grid natively — approximate with flex-wrap
      rootNode.setFlexDirection(FlexDirection.Row);
      rootNode.setFlexWrap(Wrap.Wrap);
      rootNode.setAlignItems(Align.FlexStart);
      rootNode.setAlignContent(Align.Stretch);
      rootNode.setJustifyContent(Justify.FlexStart);
    } else {
      // Approximate normal block flow as a vertical stack.
      rootNode.setFlexDirection(FlexDirection.Column);
      rootNode.setFlexWrap(Wrap.NoWrap);
      rootNode.setAlignItems(Align.Stretch);
      rootNode.setJustifyContent(Justify.FlexStart);
    }

    // Gap
    if (container.display === 'grid') {
      const rowGap = resolveGridGap(container, 'y');
      const columnGap = resolveGridGap(container, 'x');
      if (rowGap > 0) {
        rootNode.setGap(Gutter.Row, rowGap);
      }
      if (columnGap > 0) {
        rootNode.setGap(Gutter.Column, columnGap);
      }
    } else if (typeof container.gap === 'number' && container.gap > 0) {
      rootNode.setGap(Gutter.All, container.gap);
    }

    // Padding
    if (container.padding) {
      rootNode.setPadding(Edge.Top, container.padding.top);
      rootNode.setPadding(Edge.Right, container.padding.right);
      rootNode.setPadding(Edge.Bottom, container.padding.bottom);
      rootNode.setPadding(Edge.Left, container.padding.left);
    }

    // Overflow
    if (container.overflow === 'clip') {
      rootNode.setOverflow(Overflow.Hidden);
    }

    // Add child nodes
    const flowChildren: { element: CanvasElement; yogaNode: YogaNode }[] = [];
    let yogaIndex = 0;

    for (const child of children) {
      const isFlow = isChildInFlow(child);

      if (!isFlow) {
        // Absolute children skip yoga layout — use their raw x/y
        const w = this.elService.getRenderedWidth(child, allElements);
        const h = this.elService.getRenderedHeight(child, allElements);
        results.set(child.id, { x: child.x, y: child.y, width: w, height: h });
        continue;
      }

      const childNode = yoga.Node.create(config);

      // Size
      const childWidth = this.elService.getRenderedWidth(child, allElements);
      const childHeight = this.elService.getRenderedHeight(child, allElements);

      const widthMode = child.widthMode ?? 'fixed';
      const heightMode = child.heightMode ?? 'fixed';

      const mainAxisIsWidth = isMainAxisWidth(container);

      const mainFillMode = mainAxisIsWidth ? widthMode : heightMode;
      const crossFillMode = mainAxisIsWidth ? heightMode : widthMode;

      // Main axis
      if (mainFillMode === 'fill') {
        childNode.setFlexGrow(1);
        childNode.setFlexShrink(1);
        childNode.setFlexBasis(0);
      } else {
        if (mainAxisIsWidth) {
          childNode.setWidth(childWidth);
        } else {
          childNode.setHeight(childHeight);
        }
      }

      // Cross axis
      if (crossFillMode === 'fill') {
        childNode.setAlignSelf(Align.Stretch);
      } else {
        if (mainAxisIsWidth) {
          childNode.setHeight(childHeight);
        } else {
          childNode.setWidth(childWidth);
        }
      }

      // Min/max constraints
      if (child.minWidth != null) childNode.setMinWidth(child.minWidth);
      if (child.maxWidth != null) childNode.setMaxWidth(child.maxWidth);
      if (child.minHeight != null) childNode.setMinHeight(child.minHeight);
      if (child.maxHeight != null) childNode.setMaxHeight(child.maxHeight);

      // Margin
      if (child.margin) {
        childNode.setMargin(Edge.Top, child.margin.top);
        childNode.setMargin(Edge.Right, child.margin.right);
        childNode.setMargin(Edge.Bottom, child.margin.bottom);
        childNode.setMargin(Edge.Left, child.margin.left);
      }

      // Position type
      childNode.setPositionType(
        child.position === 'relative' ? PositionType.Relative : PositionType.Static,
      );

      rootNode.insertChild(childNode, yogaIndex);
      flowChildren.push({ element: child, yogaNode: childNode });
      yogaIndex++;
    }

    // Calculate layout
    rootNode.calculateLayout(containerWidth, containerHeight);

    // Read computed positions
    for (const { element, yogaNode } of flowChildren) {
      results.set(element.id, {
        x: yogaNode.getComputedLeft(),
        y: yogaNode.getComputedTop(),
        width: yogaNode.getComputedWidth(),
        height: yogaNode.getComputedHeight(),
      });
    }

    // Cleanup
    rootNode.freeRecursive();

    return results;
  }

  destroy(): void {
    this.config?.free();
    this.config = null;
    this.yoga = null;
    this.initPromise = null;
  }
}

// ── Mapping Helpers ───────────────────────────────────────

function mapFlexDirection(dir?: CanvasFlexDirection): FlexDirection {
  switch (dir) {
    case 'row':
      return FlexDirection.Row;
    case 'column':
      return FlexDirection.Column;
    case 'row-reverse':
      return FlexDirection.RowReverse;
    case 'column-reverse':
      return FlexDirection.ColumnReverse;
    default:
      return FlexDirection.Row;
  }
}

function mapJustifyContent(jc?: CanvasJustifyContent): Justify {
  switch (jc) {
    case 'flex-start':
      return Justify.FlexStart;
    case 'flex-end':
      return Justify.FlexEnd;
    case 'center':
      return Justify.Center;
    case 'space-between':
      return Justify.SpaceBetween;
    case 'space-around':
      return Justify.SpaceAround;
    case 'space-evenly':
      return Justify.SpaceEvenly;
    default:
      return Justify.FlexStart;
  }
}

function mapAlignItems(ai?: CanvasAlignItems): Align {
  switch (ai) {
    case 'flex-start':
      return Align.FlexStart;
    case 'flex-end':
      return Align.FlexEnd;
    case 'center':
      return Align.Center;
    case 'stretch':
      return Align.Stretch;
    case 'baseline':
      return Align.Baseline;
    default:
      return Align.FlexStart;
  }
}

function mapFlexWrap(wrap?: CanvasFlexWrap): Wrap {
  switch (wrap) {
    case 'wrap':
      return Wrap.Wrap;
    case 'nowrap':
      return Wrap.NoWrap;
    default:
      return Wrap.NoWrap;
  }
}

function isChildInFlow(element: CanvasElement): boolean {
  const pos = element.position;
  return !pos || pos === 'static' || pos === 'relative' || pos === 'sticky';
}

function isMainAxisWidth(container: Pick<CanvasElement, 'display' | 'flexDirection'>): boolean {
  if (container.display === 'grid') {
    return true;
  }

  if (container.display === 'block') {
    return false;
  }

  return container.flexDirection !== 'column' && container.flexDirection !== 'column-reverse';
}

function resolveGridGap(
  container: Pick<CanvasElement, 'gap' | 'gapX' | 'gapY'>,
  axis: 'x' | 'y',
): number {
  const specificGap = axis === 'x' ? container.gapX : container.gapY;
  if (typeof specificGap === 'number' && specificGap > 0) {
    return specificGap;
  }

  return typeof container.gap === 'number' && container.gap > 0 ? container.gap : 0;
}
