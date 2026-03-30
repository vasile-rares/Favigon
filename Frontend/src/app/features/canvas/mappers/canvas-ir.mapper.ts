import {
  CanvasAlignItems,
  CanvasDisplayMode,
  CanvasElement,
  CanvasFontSizeUnit,
  CanvasFlexDirection,
  CanvasJustifyContent,
  CanvasPageModel,
  CanvasPositionMode,
  CanvasProjectDocument,
  CanvasSpacing,
  CanvasTextSpacingUnit,
} from '../../../core/models/canvas.models';
import {
  AlignItems,
  BorderStyle,
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
} from '../../../core/models/ir.models';

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
  if (!element.display) return undefined;
  const mode = mapDisplayMode(element.display);
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
    locked: false,
    hidden: element.visible === false,
    selected: false,
  };
}

function buildNodeStyle(element: CanvasElement): IRStyle {
  const style: IRStyle = {
    width: px(element.width),
    height: px(element.height),
  };

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

  if (element.shadow) {
    style.shadow = element.shadow;
  }

  if (typeof element.cornerRadius === 'number') {
    style.borderRadius = px(element.cornerRadius);
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

  return style;
}

function buildNodeProps(element: CanvasElement, primitiveType: string): Record<string, unknown> {
  const props: Record<string, unknown> = {
    ...(element.irMeta?.props ?? {}),
    primitive: true,
  };

  if (element.type === 'text') {
    props['content'] = element.text ?? '';
    props['textVerticalAlign'] = element.textVerticalAlign ?? 'middle';
    if (element.fontStyle) {
      props['fontStyle'] = element.fontStyle;
    }
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

  const preservedProps = removeManagedProps(node.props);

  return {
    id: node.id,
    type: mappedType,
    name: readOptionalStringProp(node.props, 'name'),
    x: readLength(node.position?.x, DEFAULT_POSITION),
    y: readLength(node.position?.y, DEFAULT_POSITION),
    width: readLength(node.style?.width, defaults.width),
    height: readLength(node.style?.height, defaults.height),
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
    cornerRadius:
      mappedType !== 'text'
        ? readLength(node.style?.borderRadius, mappedType === 'image' ? DEFAULT_IMAGE_RADIUS : 0)
        : undefined,
    overflow:
      mappedType === 'frame'
        ? readOverflow(node.style?.overflow, readOverflowFromProps(node.props, 'clip'))
        : undefined,
    shadow: readShadow(node.style?.shadow, 'none'),
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
    fontStyle: mappedType === 'text' ? readFontStyleFromProps(node.props, 'normal') : undefined,
    textAlign: mappedType === 'text' ? readTextAlign(node.style?.textAlign, 'center') : undefined,
    textVerticalAlign:
      mappedType === 'text' ? readTextVerticalAlignFromProps(node.props, 'middle') : undefined,
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

function readOptionalStringStyle(
  style: IRStyle | undefined,
  key: keyof IRStyle,
): string | undefined {
  const value = style?.[key];
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
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

function readShadow(
  value: unknown,
  fallback: 'none' | 'sm' | 'md' | 'lg' | 'xl',
): 'none' | 'sm' | 'md' | 'lg' | 'xl' {
  return value === 'none' || value === 'sm' || value === 'md' || value === 'lg' || value === 'xl'
    ? value
    : fallback;
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
