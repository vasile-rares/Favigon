import {
  CanvasAlignItems,
  CanvasCornerRadii,
  CanvasDisplayMode,
  CanvasElement,
  CanvasFontSizeUnit,
  CanvasFlexDirection,
  CanvasJustifyContent,
  CanvasLinkType,
  CanvasPageModel,
  CanvasPositionMode,
  CanvasProjectDocument,
  CanvasSizeMode,
  CanvasSpacing,
  CanvasTextSpacingUnit,
  AlignItems,
  BorderStyle,
  ConverterPageRequest,
  FlexDirection,
  IRBorder,
  IRLayout,
  IRLength,
  IRMeta,
  IRNode,
  IRPosition,
  IRSpacing,
  IRStyle,
  JustifyContent,
  LayoutMode,
  length,
  PositionMode,
  px,
} from '@app/core';
import {
  buildCanvasElementBackfaceVisibility,
  buildCanvasElementTransform,
  buildCanvasElementTransformOrigin,
  buildCanvasElementTransformStyle,
  parseCanvasTransformStyle,
} from '../utils/canvas-transform.util';
import {
  hasCanvasElementLink,
  normalizeCanvasAccessibilityLabel,
  normalizeStoredCanvasTag,
} from '../utils/canvas-accessibility.util';
import {
  getCanvasConstraintMode,
  getCanvasConstraintSizingValue,
  getCanvasConstraintValue,
  getCanvasSizeMode,
  getCanvasSizingValue,
} from '../utils/canvas-sizing.util';
import { normalizeCanvasShadowValue } from '../utils/canvas-shadow.util';

const ROOT_ROLE = 'canvas-root';
const ROOT_TYPE = 'Container';
const CANVAS_DOCUMENT_PROP = 'favigonCanvasDocument';
const MANAGED_PROP_KEYS = [
  'content',
  'src',
  'name',
  'overflow',
  'textVerticalAlign',
  'fontStyle',
  'primitive',
  'sourceType',
  'tag',
  'ariaLabel',
  'alt',
  'widthMode',
  'heightMode',
  'href',
  'target',
  'linkType',
  'linkPageId',
] as const;

const DEFAULT_POSITION = 24;
const DEFAULT_FILL = '#e0e0e0';
const DEFAULT_FRAME_FILL = '#3f3f46';
const DEFAULT_IMAGE_RADIUS = 6;
const DEFAULT_OPACITY = 1;
const DEFAULT_STROKE_WIDTH = 1;
const DEFAULT_PAGE_VIEWPORT_WIDTH = 1280;
const DEFAULT_PAGE_VIEWPORT_HEIGHT = 720;

const DEFAULT_ELEMENT_SIZE = {
  text: { width: 150, height: 40 },
  generic: { width: 100, height: 100 },
} as const;

export function buildCanvasIR(
  elements: CanvasElement[],
  projectId: string,
  pageName?: string,
): IRNode {
  const rootId = `canvas-${projectId}`;
  const nodesById = createNodeIndex(elements);
  const rootChildren = resolveRootChildren(elements, nodesById, rootId);

  return createRootNode(projectId, rootId, rootChildren, pageName);
}

export function buildCanvasIRPages(
  pages: CanvasPageModel[],
  projectId: string,
): ConverterPageRequest[] {
  const requests: ConverterPageRequest[] = [];

  for (const page of pages) {
    if (page.elements.length === 0) continue;

    const visibleElements = page.elements.filter((e) => e.visible !== false);
    const rootFrames = visibleElements.filter((e) => e.type === 'frame' && !e.parentId);

    if (rootFrames.length > 0) {
      const primaryFrame = rootFrames.find((f) => f.isPrimary) ?? rootFrames[0];
      const primaryElements = collectFrameSubtree(primaryFrame.id, visibleElements);

      requests.push({
        viewportWidth: primaryFrame.width,
        pageName: page.name,
        ir: buildCanvasIR(primaryElements, projectId, page.name),
      });

      for (const frame of rootFrames) {
        if (frame.id === primaryFrame.id) continue;

        const frameElements = collectFrameSubtree(frame.id, visibleElements);
        const syncedElements = syncBreakpointElements(
          frameElements,
          frame.id,
          primaryFrame,
          primaryElements,
        );
        requests.push({
          viewportWidth: frame.width,
          pageName: page.name,
          ir: buildCanvasIR(syncedElements, projectId, page.name),
        });
      }
    } else {
      requests.push({
        viewportWidth: page.viewportWidth ?? 1280,
        pageName: page.name,
        ir: buildCanvasIR(visibleElements, projectId, page.name),
      });
    }
  }

  return requests.sort((a, b) => b.viewportWidth - a.viewportWidth);
}

function syncBreakpointElements(
  breakpointElements: CanvasElement[],
  breakpointFrameId: string,
  primaryFrame: CanvasElement,
  primaryElements: CanvasElement[],
): CanvasElement[] {
  const primaryById = new Map<string, CanvasElement>();
  for (const el of primaryElements) {
    primaryById.set(el.id, el);
  }

  return breakpointElements.map((el) => {
    if (el.id === breakpointFrameId) {
      return { ...el, id: primaryFrame.id, name: primaryFrame.name };
    }
    const syncedParentId = el.parentId === breakpointFrameId ? primaryFrame.id : el.parentId;
    if (el.primarySyncId) {
      const primaryEl = primaryById.get(el.primarySyncId);
      return {
        ...el,
        id: el.primarySyncId,
        name: primaryEl?.name ?? el.name,
        parentId: syncedParentId,
      };
    }
    return { ...el, parentId: syncedParentId };
  });
}

function collectFrameSubtree(frameId: string, allElements: CanvasElement[]): CanvasElement[] {
  const result: CanvasElement[] = [];
  const frame = allElements.find((e) => e.id === frameId);
  if (!frame) return result;

  result.push(frame);
  const queue = [frameId];
  while (queue.length > 0) {
    const parentId = queue.shift()!;
    for (const el of allElements) {
      if (el.parentId === parentId) {
        result.push(el);
        queue.push(el.id);
      }
    }
  }
  return result;
}

export function buildCanvasProjectDocument(
  pages: CanvasPageModel[],
  projectId: string,
  activePageId: string | null,
): CanvasProjectDocument {
  const normalizedPages = pages;

  return {
    version: '2.0',
    projectId,
    activePageId: activePageId ?? normalizedPages[0]?.id ?? null,
    pages: normalizedPages.map((page) => ({
      id: page.id,
      name: page.name,
      viewportPreset: normalizeViewportPreset(page.viewportPreset),
      viewportWidth: normalizePageDimension(page.viewportWidth, DEFAULT_PAGE_VIEWPORT_WIDTH),
      viewportHeight: normalizePageDimension(page.viewportHeight, DEFAULT_PAGE_VIEWPORT_HEIGHT),
      canvasX: normalizeCanvasCoordinate(page.canvasX, 0),
      canvasY: normalizeCanvasCoordinate(page.canvasY, 0),
      elements: page.elements.map((element) => ({
        ...element,
        visible: element.visible !== false,
      })),
    })),
  };
}

export function buildPersistedCanvasDesign(document: CanvasProjectDocument): IRNode {
  const normalizedDocument = buildCanvasProjectDocument(
    document.pages,
    document.projectId,
    document.activePageId,
  );
  const activePage =
    normalizedDocument.pages.find((page) => page.id === normalizedDocument.activePageId) ??
    normalizedDocument.pages[0];
  const root = buildCanvasIR(activePage?.elements ?? [], document.projectId, activePage?.name);

  root.props = {
    ...root.props,
    [CANVAS_DOCUMENT_PROP]: normalizedDocument,
  };

  return root;
}

export function buildCanvasProjectDocumentFromUnknown(
  rawDesign: unknown,
  projectId: string,
): CanvasProjectDocument {
  const persistedDocument = readPersistedCanvasProjectDocument(rawDesign, projectId);
  if (persistedDocument) {
    return persistedDocument;
  }

  if (isCanvasProjectDocument(rawDesign)) {
    const rawPages = Array.isArray(rawDesign.pages) ? rawDesign.pages : [];
    const pages = rawPages.length > 0 ? rawPages : [createDefaultPageModel()];
    const fallbackActivePageId = pages[0]?.id ?? null;

    return {
      version: typeof rawDesign.version === 'string' ? rawDesign.version : '2.0',
      projectId:
        typeof rawDesign.projectId === 'string' && rawDesign.projectId.trim().length > 0
          ? rawDesign.projectId
          : projectId,
      activePageId:
        typeof rawDesign.activePageId === 'string' &&
        pages.some((page) => page.id === rawDesign.activePageId)
          ? rawDesign.activePageId
          : fallbackActivePageId,
      pages: pages.map((page, index) => normalizeCanvasPage(page, index + 1)),
    };
  }

  const legacyElements = buildCanvasElementsFromIR(rawDesign as IRNode | null | undefined);
  const legacyPages =
    legacyElements.length > 0
      ? [{ id: crypto.randomUUID(), name: 'Page 1', elements: legacyElements }]
      : [];
  return buildCanvasProjectDocument(legacyPages, projectId, null);
}

export function buildCanvasElementsFromIR(root: IRNode | null | undefined): CanvasElement[] {
  if (!root || !Array.isArray(root.children)) {
    return [];
  }

  const flattened: CanvasElement[] = [];
  for (const child of root.children) {
    flattenIRNode(child, root.id, flattened);
  }

  return flattened;
}

function createNodeIndex(elements: CanvasElement[]): Map<string, IRNode> {
  const nodesById = new Map<string, IRNode>();

  for (const element of elements) {
    nodesById.set(element.id, mapCanvasElementToIR(element));
  }

  return nodesById;
}

function resolveRootChildren(
  elements: CanvasElement[],
  nodesById: Map<string, IRNode>,
  rootId: string,
): IRNode[] {
  const rootChildren: IRNode[] = [];

  for (const element of elements) {
    const currentNode = nodesById.get(element.id);
    if (!currentNode) {
      continue;
    }

    const parentId = element.parentId;
    if (!parentId || parentId === rootId || parentId === element.id) {
      rootChildren.push(currentNode);
      continue;
    }

    const parentNode = nodesById.get(parentId);
    if (!parentNode) {
      rootChildren.push(currentNode);
      continue;
    }

    parentNode.children.push(currentNode);
  }

  return rootChildren;
}

function createRootNode(
  projectId: string,
  rootId: string,
  children: IRNode[],
  pageName?: string,
): IRNode {
  return {
    id: rootId,
    type: ROOT_TYPE,
    props: {
      projectId,
      role: ROOT_ROLE,
      ...(pageName ? { pageName } : {}),
    },
    layout: {
      mode: 'Flex' satisfies LayoutMode,
      direction: 'Column',
    },
    style: {
      width: { value: 100, unit: '%' },
      height: { value: 100, unit: '%' },
    },
    variants: {},
    meta: { locked: false, hidden: false, selected: false },
    children,
  };
}

function mapCanvasElementToIR(element: CanvasElement): IRNode {
  const primitiveType = mapElementType(element.type);

  return {
    id: element.id,
    type: primitiveType,
    props: buildNodeProps(element, primitiveType),
    layout: buildNodeLayout(element),
    style: buildNodeStyle(element),
    position: buildNodePosition(element),
    meta: buildNodeMeta(element),
    variants: {},
    children: [],
  };
}

function buildNodeLayout(element: CanvasElement): IRLayout | undefined {
  const isText = element.type === 'text';
  const textVA = isText ? (element.textVerticalAlign ?? 'middle') : null;
  const needsFlexForVA = textVA !== null && textVA !== 'top';

  if (!element.display && !needsFlexForVA) return undefined;

  const mode: LayoutMode = element.display ? mapDisplayMode(element.display) : 'Flex';
  const layout: IRLayout = { mode };

  if (element.display === 'flex') {
    if (element.flexDirection) layout.direction = mapFlexDirection(element.flexDirection);
    if (element.flexWrap !== undefined) layout.wrap = element.flexWrap === 'wrap';
    if (element.justifyContent) layout.justify = mapJustifyContent(element.justifyContent);
    if (element.alignItems) layout.align = mapAlignItems(element.alignItems);
    if (typeof element.gap === 'number') layout.gap = px(element.gap);
  }
  if (element.display === 'grid') {
    if (element.gridTemplateColumns) layout.gridTemplateColumns = element.gridTemplateColumns;
    if (element.gridTemplateRows) layout.gridTemplateRows = element.gridTemplateRows;
    if (typeof element.gap === 'number') layout.gap = px(element.gap);
  }

  // Text vertical alignment: map onto flex align-items (cross-axis in row layout)
  if (needsFlexForVA && textVA !== null) {
    layout.align ??= textVA === 'bottom' ? 'End' : 'Center';
  }

  return layout;
}

function buildNodePosition(element: CanvasElement): IRPosition {
  if (!element.position) {
    return { mode: 'Absolute', x: px(element.x), y: px(element.y) };
  }
  const mode = mapPositionMode(element.position);
  const pos: IRPosition = { mode };
  if (element.position === 'absolute' || element.position === 'fixed') {
    pos.x = px(element.x);
    pos.y = px(element.y);
  }
  if (element.position === 'sticky') {
    pos.y = px(element.y);
  }
  return pos;
}

function buildNodeMeta(element: CanvasElement): IRMeta {
  return {
    name: element.name || undefined,
    locked: false,
    hidden: element.visible === false,
    selected: false,
  };
}

function buildNodeStyle(element: CanvasElement): IRStyle {
  const style: IRStyle = {};
  applyNodeDimensionStyle(style, element, 'width');
  applyNodeDimensionStyle(style, element, 'height');
  applyNodeConstraintStyle(style, element, 'minWidth');
  applyNodeConstraintStyle(style, element, 'maxWidth');
  applyNodeConstraintStyle(style, element, 'minHeight');
  applyNodeConstraintStyle(style, element, 'maxHeight');

  if (element.fill) {
    style.background = element.fill;
  }

  if (element.stroke) {
    const strokeWidth =
      typeof element.strokeWidth === 'number'
        ? Math.max(0, element.strokeWidth)
        : DEFAULT_STROKE_WIDTH;

    if (strokeWidth > 0) {
      style.border = {
        width: px(strokeWidth),
        color: element.stroke,
        style: (element.strokeStyle as BorderStyle | undefined) ?? 'Solid',
      } satisfies IRBorder;
    }
  }

  if (typeof element.opacity === 'number') {
    style.opacity = element.opacity;
  }

  if (element.type === 'frame' && element.overflow) {
    style.overflow = element.overflow;
  }

  const shadow = normalizeCanvasShadowValue(element.shadow);
  if (shadow) {
    style.shadow = shadow;
  }

  if (typeof element.cornerRadius === 'number') {
    style.borderRadius = px(element.cornerRadius);
  }

  if (element.cornerRadii) {
    style.borderTopLeftRadius = px(element.cornerRadii.topLeft);
    style.borderTopRightRadius = px(element.cornerRadii.topRight);
    style.borderBottomRightRadius = px(element.cornerRadii.bottomRight);
    style.borderBottomLeftRadius = px(element.cornerRadii.bottomLeft);
  }

  if (element.type === 'text') {
    if (element.fontSize) {
      style.fontSize = length(element.fontSize, element.fontSizeUnit ?? 'px');
    }

    if (element.fontFamily) {
      style.fontFamily = element.fontFamily;
    }

    if (typeof element.fontWeight === 'number') {
      style.fontWeight = element.fontWeight;
    }

    if (element.fontStyle) {
      style.fontStyle = element.fontStyle;
    }

    if (element.textAlign) {
      style.textAlign = element.textAlign;
    }

    if (typeof element.lineHeight === 'number') {
      style.lineHeight = length(element.lineHeight, element.lineHeightUnit ?? 'em');
    }

    if (typeof element.letterSpacing === 'number') {
      style.letterSpacing = length(element.letterSpacing, element.letterSpacingUnit ?? 'px');
    }
  }

  if (element.padding) style.padding = buildIRSpacing(element.padding);
  if (element.margin) style.margin = buildIRSpacing(element.margin);

  const transform = buildCanvasElementTransform(element);
  if (transform) {
    style.transform = transform;
  }

  const transformOrigin = buildCanvasElementTransformOrigin(element);
  if (transformOrigin) {
    style.transformOrigin = transformOrigin;
  }

  const backfaceVisibility = buildCanvasElementBackfaceVisibility(element);
  if (backfaceVisibility) {
    style.backfaceVisibility = backfaceVisibility;
  }

  const transformStyle = buildCanvasElementTransformStyle(element);
  if (transformStyle) {
    style.transformStyle = transformStyle;
  }

  return style;
}

function applyNodeDimensionStyle(
  style: IRStyle,
  element: CanvasElement,
  axis: 'width' | 'height',
): void {
  const mode = getCanvasSizeMode(element, axis);
  const sizingValue = getCanvasSizingValue(element, axis);

  if (mode === 'fit-content') {
    return;
  }

  if (mode === 'fixed') {
    style[axis] = px(axis === 'width' ? element.width : element.height);
    return;
  }

  if (mode === 'fill') {
    style[axis] = length(100, '%');
    return;
  }

  if (mode === 'relative') {
    style[axis] = length(sizingValue ?? 100, '%');
    return;
  }

  style[axis] = length(sizingValue ?? 100, axis === 'width' ? 'vw' : 'vh');
}

function applyNodeConstraintStyle(
  style: IRStyle,
  element: CanvasElement,
  field: 'minWidth' | 'maxWidth' | 'minHeight' | 'maxHeight',
): void {
  const pixels = getCanvasConstraintValue(element, field);
  if (!Number.isFinite(pixels ?? Number.NaN)) {
    return;
  }

  const mode = getCanvasConstraintMode(element, field);
  if (mode === 'relative') {
    style[field] = length(getCanvasConstraintSizingValue(element, field) ?? 100, '%');
    return;
  }

  style[field] = px(pixels as number);
}

function buildNodeProps(element: CanvasElement, primitiveType: string): Record<string, unknown> {
  const props: Record<string, unknown> = {
    ...(element.irMeta?.props ?? {}),
    primitive: true,
  };
  const hasLink = hasCanvasElementLink(element);
  const tag = normalizeStoredCanvasTag(element.type, element.tag, hasLink);
  const ariaLabel = normalizeCanvasAccessibilityLabel(element.ariaLabel);

  if (element.type === 'text') {
    props['content'] = element.text ?? '';
    props['textVerticalAlign'] = element.textVerticalAlign ?? 'middle';
  }

  if (element.type === 'image') {
    props['src'] = element.imageUrl ?? '';
  }

  if (element.type === 'frame') {
    props['overflow'] = element.overflow ?? 'clip';
  }

  if (element.irMeta?.type && element.irMeta.type !== primitiveType) {
    props['sourceType'] = element.irMeta.type;
  }

  if (typeof element.name === 'string') {
    props['name'] = element.name;
  }

  if (element.widthMode && element.widthMode !== 'fixed') {
    props['widthMode'] = element.widthMode;
  }

  if (element.heightMode && element.heightMode !== 'fixed') {
    props['heightMode'] = element.heightMode;
  }

  if (tag) {
    props['tag'] = tag;
  }

  if (ariaLabel) {
    if (element.type === 'image') {
      props['alt'] = ariaLabel;
    } else {
      props['ariaLabel'] = ariaLabel;
    }
  }

  if (element.linkType === 'page' && typeof element.linkPageId === 'string') {
    const linkPageId = element.linkPageId.trim();
    if (linkPageId.length > 0) {
      props['linkType'] = 'page';
      props['linkPageId'] = linkPageId;
      props['href'] = `#${linkPageId}`;
    }
  }

  if (element.linkType === 'url') {
    const href = normalizeExternalLinkUrl(element.linkUrl);
    if (href) {
      props['linkType'] = 'url';
      props['href'] = href;
      props['target'] = '_blank';
    }
  }

  return props;
}

function mapElementType(type: CanvasElement['type']): string {
  switch (type) {
    case 'frame':
      return 'Frame';
    case 'rectangle':
      return 'Container';
    case 'text':
      return 'Text';
    case 'image':
      return 'Image';
    default:
      return 'Frame';
  }
}

function buildIRSpacing(s: CanvasSpacing): IRSpacing {
  return { top: px(s.top), right: px(s.right), bottom: px(s.bottom), left: px(s.left) };
}

function mapDisplayMode(display: CanvasDisplayMode): LayoutMode {
  switch (display) {
    case 'block':
      return 'Block';
    case 'flex':
      return 'Flex';
    case 'grid':
      return 'Grid';
  }
}

function mapFlexDirection(dir: CanvasFlexDirection): FlexDirection {
  switch (dir) {
    case 'row':
      return 'Row';
    case 'column':
      return 'Column';
    case 'row-reverse':
      return 'RowReverse';
    case 'column-reverse':
      return 'ColumnReverse';
  }
}

function mapJustifyContent(jc: CanvasJustifyContent): JustifyContent {
  switch (jc) {
    case 'flex-start':
      return 'Start';
    case 'flex-end':
      return 'End';
    case 'center':
      return 'Center';
    case 'space-between':
      return 'SpaceBetween';
    case 'space-around':
      return 'SpaceAround';
    case 'space-evenly':
      return 'SpaceEvenly';
  }
}

function mapAlignItems(ai: CanvasAlignItems): AlignItems {
  switch (ai) {
    case 'flex-start':
      return 'Start';
    case 'flex-end':
      return 'End';
    case 'center':
      return 'Center';
    case 'stretch':
      return 'Stretch';
    case 'baseline':
      return 'Baseline';
  }
}

function mapPositionMode(pos: CanvasPositionMode): PositionMode {
  switch (pos) {
    case 'static':
      return 'Flow';
    case 'relative':
      return 'Relative';
    case 'absolute':
      return 'Absolute';
    case 'fixed':
      return 'Fixed';
    case 'sticky':
      return 'Sticky';
  }
}

function mapIRNodeToCanvasElement(node: IRNode): CanvasElement {
  const mappedType = mapIRType(node.type);
  const defaults = mappedType === 'text' ? DEFAULT_ELEMENT_SIZE.text : DEFAULT_ELEMENT_SIZE.generic;
  const linkType = readLinkTypeFromProps(node.props);
  const importedTag = readOptionalStringProp(node.props, 'tag');
  const importedWidthMode = readSizeModeFromProps(node.props, 'widthMode');
  const importedHeightMode = readSizeModeFromProps(node.props, 'heightMode');
  const importedAriaLabel =
    mappedType === 'image'
      ? (readOptionalStringProp(node.props, 'alt') ??
        readOptionalStringProp(node.props, 'ariaLabel'))
      : readOptionalStringProp(node.props, 'ariaLabel');
  const defaultCornerRadius = mappedType === 'image' ? DEFAULT_IMAGE_RADIUS : 0;
  const cornerRadius =
    mappedType !== 'text'
      ? resolveImportedCornerRadius(node.style, defaultCornerRadius)
      : undefined;
  const cornerRadii =
    mappedType !== 'text'
      ? readCornerRadii(node.style, cornerRadius ?? defaultCornerRadius)
      : undefined;

  const preservedProps = removeManagedProps(node.props);
  const transformFields = parseCanvasTransformStyle(node.style);

  return {
    id: node.id,
    type: mappedType,
    name: readOptionalStringProp(node.props, 'name'),
    x: readLength(node.position?.x, DEFAULT_POSITION),
    y: readLength(node.position?.y, DEFAULT_POSITION),
    width:
      importedWidthMode === 'fixed'
        ? readLength(node.style?.width, defaults.width)
        : defaults.width,
    widthMode: importedWidthMode === 'fixed' ? undefined : importedWidthMode,
    widthSizingValue: readImportedSizeValue(node.style?.width, importedWidthMode),
    minWidth: readOptionalLength(node.style?.minWidth),
    minWidthMode: readConstraintModeFromLength(node.style?.minWidth),
    minWidthSizingValue: readImportedConstraintValue(node.style?.minWidth),
    maxWidth: readOptionalLength(node.style?.maxWidth),
    maxWidthMode: readConstraintModeFromLength(node.style?.maxWidth),
    maxWidthSizingValue: readImportedConstraintValue(node.style?.maxWidth),
    height:
      importedHeightMode === 'fixed'
        ? readLength(node.style?.height, defaults.height)
        : defaults.height,
    heightMode: importedHeightMode === 'fixed' ? undefined : importedHeightMode,
    heightSizingValue: readImportedSizeValue(node.style?.height, importedHeightMode),
    minHeight: readOptionalLength(node.style?.minHeight),
    minHeightMode: readConstraintModeFromLength(node.style?.minHeight),
    minHeightSizingValue: readImportedConstraintValue(node.style?.minHeight),
    maxHeight: readOptionalLength(node.style?.maxHeight),
    maxHeightMode: readConstraintModeFromLength(node.style?.maxHeight),
    maxHeightSizingValue: readImportedConstraintValue(node.style?.maxHeight),
    visible: !(node.meta?.hidden ?? false),
    fill:
      mappedType !== 'text'
        ? (node.style?.background ?? (mappedType === 'frame' ? DEFAULT_FRAME_FILL : DEFAULT_FILL))
        : undefined,
    stroke: node.style?.border?.color,
    strokeWidth:
      mappedType !== 'text'
        ? readLength(node.style?.border?.width, DEFAULT_STROKE_WIDTH)
        : undefined,
    strokeStyle: mappedType !== 'text' ? (node.style?.border?.style ?? 'Solid') : undefined,
    opacity: readNumber(node.style?.opacity, DEFAULT_OPACITY),
    cornerRadius,
    cornerRadii,
    overflow:
      mappedType === 'frame'
        ? readOverflow(node.style?.overflow, readOverflowFromProps(node.props, 'clip'))
        : undefined,
    shadow: readShadow(node.style?.shadow),
    text: mappedType === 'text' ? readStringProp(node.props, 'content', 'New text') : undefined,
    fontSize: mappedType === 'text' ? readLength(node.style?.fontSize, 16) : undefined,
    fontSizeUnit:
      mappedType === 'text'
        ? readLengthUnit<CanvasFontSizeUnit>(node.style?.fontSize, 'px', ['px', 'rem'])
        : undefined,
    fontFamily:
      mappedType === 'text'
        ? (readOptionalStringStyle(node.style, 'fontFamily') ?? 'Inter')
        : undefined,
    fontWeight: mappedType === 'text' ? readNumber(node.style?.fontWeight, 400) : undefined,
    fontStyle: mappedType === 'text' ? readFontStyleFromStyle(node.style) : undefined,
    textAlign: mappedType === 'text' ? readTextAlign(node.style?.textAlign, 'center') : undefined,
    textVerticalAlign:
      mappedType === 'text' ? readTextVerticalAlignFromLayout(node.layout, 'middle') : undefined,
    letterSpacing: mappedType === 'text' ? readLength(node.style?.letterSpacing, 0) : undefined,
    letterSpacingUnit:
      mappedType === 'text'
        ? readLengthUnit<CanvasTextSpacingUnit>(node.style?.letterSpacing, 'px', ['px', 'em'])
        : undefined,
    lineHeight: mappedType === 'text' ? readLength(node.style?.lineHeight, 1.2) : undefined,
    lineHeightUnit:
      mappedType === 'text'
        ? readLengthUnit<CanvasTextSpacingUnit>(node.style?.lineHeight, 'em', ['px', 'em'])
        : undefined,
    imageUrl: mappedType === 'image' ? readStringProp(node.props, 'src', '') : undefined,
    linkType,
    linkPageId: readOptionalStringProp(node.props, 'linkPageId') ?? undefined,
    linkUrl: readOptionalStringProp(node.props, 'href') ?? undefined,
    tag: normalizeStoredCanvasTag(mappedType, importedTag, linkType !== undefined),
    ariaLabel: normalizeCanvasAccessibilityLabel(importedAriaLabel),
    ...transformFields,
    irMeta: {
      type: node.type,
      props: preservedProps,
      style: node.style ? { ...node.style } : undefined,
    },
  };
}

function mapIRType(type: string): CanvasElement['type'] {
  switch (type) {
    case 'Frame':
      return 'frame';
    case 'Container':
      return 'rectangle';
    case 'Text':
    case 'Heading':
    case 'Link':
      return 'text';
    case 'Image':
      return 'image';
    default:
      return 'rectangle';
  }
}

function flattenIRNode(node: IRNode, parentId: string | null, target: CanvasElement[]) {
  const mapped = mapIRNodeToCanvasElement(node);
  mapped.parentId = parentId;
  target.push(mapped);

  if (!Array.isArray(node.children)) {
    return;
  }

  for (const child of node.children) {
    flattenIRNode(child, node.id, target);
  }
}

function removeManagedProps(props: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!props) {
    return {};
  }

  const clone: Record<string, unknown> = { ...props };
  for (const key of MANAGED_PROP_KEYS) {
    delete clone[key];
  }

  return clone;
}

function isCanvasProjectDocument(rawDesign: unknown): rawDesign is Partial<CanvasProjectDocument> {
  if (!rawDesign || typeof rawDesign !== 'object') {
    return false;
  }

  return Array.isArray((rawDesign as { pages?: unknown }).pages);
}

function readPersistedCanvasProjectDocument(
  rawDesign: unknown,
  projectId: string,
): CanvasProjectDocument | null {
  if (!rawDesign || typeof rawDesign !== 'object') {
    return null;
  }

  const rawRoot = rawDesign as Partial<IRNode>;
  const props = rawRoot.props;
  if (!props || typeof props !== 'object') {
    return null;
  }

  const rawDocument = (props as Record<string, unknown>)[CANVAS_DOCUMENT_PROP];
  if (!rawDocument || typeof rawDocument !== 'object') {
    return null;
  }

  return buildCanvasProjectDocumentFromUnknown(rawDocument, projectId);
}

function normalizeCanvasPage(rawPage: unknown, pageIndex: number): CanvasPageModel {
  const page = rawPage && typeof rawPage === 'object' ? (rawPage as Partial<CanvasPageModel>) : {};
  const normalizedName =
    typeof page.name === 'string' && page.name.trim().length > 0
      ? page.name.trim()
      : `Page ${pageIndex}`;

  return {
    id: typeof page.id === 'string' && page.id.trim().length > 0 ? page.id : crypto.randomUUID(),
    name: normalizedName,
    viewportPreset: normalizeViewportPreset(page.viewportPreset),
    viewportWidth: normalizePageDimension(page.viewportWidth, DEFAULT_PAGE_VIEWPORT_WIDTH),
    viewportHeight: normalizePageDimension(page.viewportHeight, DEFAULT_PAGE_VIEWPORT_HEIGHT),
    canvasX: normalizeCanvasCoordinate(page.canvasX, 0),
    canvasY: normalizeCanvasCoordinate(page.canvasY, 0),
    elements: Array.isArray(page.elements)
      ? page.elements.map((element) => ({
          ...element,
          visible: element.visible !== false,
        }))
      : [],
  };
}

function createDefaultPageModel(): CanvasPageModel {
  return {
    id: crypto.randomUUID(),
    name: 'Page 1',
    viewportPreset: 'desktop',
    viewportWidth: DEFAULT_PAGE_VIEWPORT_WIDTH,
    viewportHeight: DEFAULT_PAGE_VIEWPORT_HEIGHT,
    canvasX: 0,
    canvasY: 0,
    elements: [],
  };
}

function normalizeViewportPreset(value: unknown): 'desktop' | 'tablet' | 'mobile' | 'custom' {
  return value === 'desktop' || value === 'tablet' || value === 'mobile' || value === 'custom'
    ? value
    : 'desktop';
}

function normalizePageDimension(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.max(100, Math.round(value));
}

function normalizeCanvasCoordinate(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.round(value);
}

function readLength(len: IRLength | undefined, fallback: number): number {
  if (!len) {
    return fallback;
  }
  return Number.isFinite(len.value) ? len.value : fallback;
}

function readCornerRadii(
  style: IRStyle | undefined,
  fallback: number,
): CanvasCornerRadii | undefined {
  if (!style) {
    return undefined;
  }

  const hasSpecificCornerRadius =
    style.borderTopLeftRadius !== undefined ||
    style.borderTopRightRadius !== undefined ||
    style.borderBottomRightRadius !== undefined ||
    style.borderBottomLeftRadius !== undefined;

  if (!hasSpecificCornerRadius) {
    return undefined;
  }

  return {
    topLeft: readLength(style.borderTopLeftRadius, fallback),
    topRight: readLength(style.borderTopRightRadius, fallback),
    bottomRight: readLength(style.borderBottomRightRadius, fallback),
    bottomLeft: readLength(style.borderBottomLeftRadius, fallback),
  };
}

function resolveImportedCornerRadius(style: IRStyle | undefined, fallback: number): number {
  if (!style) {
    return fallback;
  }

  if (style.borderRadius) {
    return readLength(style.borderRadius, fallback);
  }

  return readLength(
    style.borderTopLeftRadius ??
      style.borderTopRightRadius ??
      style.borderBottomRightRadius ??
      style.borderBottomLeftRadius,
    fallback,
  );
}

function readLengthUnit<TUnit extends string>(
  len: IRLength | undefined,
  fallback: TUnit,
  allowedUnits: readonly TUnit[],
): TUnit {
  if (!len || typeof len.unit !== 'string') {
    return fallback;
  }

  return allowedUnits.includes(len.unit as TUnit) ? (len.unit as TUnit) : fallback;
}

function readSizeModeFromProps(
  props: Record<string, unknown> | undefined,
  key: 'widthMode' | 'heightMode',
): CanvasSizeMode {
  const value = props?.[key];
  if (value === 'relative' || value === 'fill' || value === 'fit-content' || value === 'viewport') {
    return value;
  }

  return 'fixed';
}

function readImportedSizeValue(
  len: IRLength | undefined,
  mode: CanvasSizeMode,
): number | undefined {
  if (mode === 'fixed' || mode === 'fit-content') {
    return undefined;
  }

  if (mode === 'fill') {
    return 100;
  }

  return Number.isFinite(len?.value ?? Number.NaN) ? len?.value : undefined;
}

function readOptionalLength(len: IRLength | undefined): number | undefined {
  return Number.isFinite(len?.value ?? Number.NaN) ? len?.value : undefined;
}

function readConstraintModeFromLength(len: IRLength | undefined): 'fixed' | 'relative' | undefined {
  if (!len) {
    return undefined;
  }

  return len.unit === '%' ? 'relative' : 'fixed';
}

function readImportedConstraintValue(len: IRLength | undefined): number | undefined {
  if (!len || len.unit !== '%') {
    return undefined;
  }

  return Number.isFinite(len.value) ? len.value : undefined;
}

function readOptionalStringStyle(
  style: IRStyle | undefined,
  key: keyof IRStyle,
): string | undefined {
  const value = style?.[key];
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}

function readFontStyleFromStyle(style: IRStyle | undefined): 'normal' | 'italic' {
  return style?.fontStyle === 'italic' ? 'italic' : 'normal';
}

function readFontStyleFromProps(
  props: Record<string, unknown> | undefined,
  fallback: 'normal' | 'italic',
): 'normal' | 'italic' {
  const value = props?.['fontStyle'];
  return value === 'italic' ? 'italic' : fallback;
}

function readTextAlign(
  value: unknown,
  fallback: 'left' | 'center' | 'right' | 'justify',
): 'left' | 'center' | 'right' | 'justify' {
  return value === 'left' || value === 'center' || value === 'right' || value === 'justify'
    ? value
    : fallback;
}

function readTextVerticalAlignFromLayout(
  layout: IRLayout | undefined,
  fallback: 'top' | 'middle' | 'bottom',
): 'top' | 'middle' | 'bottom' {
  switch (layout?.align) {
    case 'Start':
      return 'top';
    case 'Center':
      return 'middle';
    case 'End':
      return 'bottom';
    default:
      return fallback;
  }
}

function readTextVerticalAlignFromProps(
  props: Record<string, unknown> | undefined,
  fallback: 'top' | 'middle' | 'bottom',
): 'top' | 'middle' | 'bottom' {
  const value = props?.['textVerticalAlign'];
  return value === 'top' || value === 'middle' || value === 'bottom' ? value : fallback;
}

function readOverflowFromProps(
  props: Record<string, unknown> | undefined,
  fallback: 'clip' | 'visible',
): 'clip' | 'visible' {
  const value = props?.['overflow'];
  return value === 'clip' || value === 'visible' ? value : fallback;
}

function readOverflow(value: unknown, fallback: 'clip' | 'visible'): 'clip' | 'visible' {
  return value === 'clip' || value === 'visible' ? value : fallback;
}

function readStringProp(
  props: Record<string, unknown> | undefined,
  key: string,
  fallback: string,
): string {
  const value = props?.[key];
  return typeof value === 'string' ? value : fallback;
}

function readOptionalStringProp(
  props: Record<string, unknown> | undefined,
  key: string,
): string | undefined {
  const value = props?.[key];
  return typeof value === 'string' ? value : undefined;
}

function readLinkTypeFromProps(
  props: Record<string, unknown> | undefined,
): CanvasLinkType | undefined {
  const value = props?.['linkType'];
  if (value === 'page' || value === 'url') {
    return value;
  }

  return typeof props?.['href'] === 'string' ? 'url' : undefined;
}

function normalizeExternalLinkUrl(value: string | undefined): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const normalized = value.trim();
  if (!normalized) {
    return undefined;
  }

  if (
    normalized.startsWith('/') ||
    normalized.startsWith('#') ||
    normalized.startsWith('//') ||
    /^[a-z][a-z0-9+.-]*:/i.test(normalized)
  ) {
    return normalized;
  }

  return `https://${normalized}`;
}

function readShadow(value: unknown): string | undefined {
  return normalizeCanvasShadowValue(value);
}

function readNumber(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return fallback;
}
