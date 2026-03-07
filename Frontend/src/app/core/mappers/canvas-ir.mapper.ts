import {
  CanvasElement,
  CanvasPageModel,
  CanvasProjectDocument,
  CanvasStrokePosition,
} from '../models/canvas.models';
import { IRNode, IRStyle } from '../models/ir.models';

const ROOT_ROLE = 'canvas-root';
const ROOT_TYPE = 'Container';
const CANVAS_DOCUMENT_PROP = 'prismaticCanvasDocument';
const MANAGED_PROP_KEYS = [
  'x',
  'y',
  'content',
  'src',
  'strokePosition',
  'strokeWidth',
  'name',
  'visible',
  'textVerticalAlign',
] as const;

const DEFAULT_POSITION = 24;
const DEFAULT_FILL = '#e0e0e0';
const DEFAULT_FRAME_FILL = '#3f3f46';
const DEFAULT_IMAGE_RADIUS = 6;
const DEFAULT_OPACITY = 1;
const DEFAULT_STROKE_WIDTH = 1;
const DEFAULT_STROKE_POSITION: CanvasStrokePosition = 'inside';
const CIRCLE_RADIUS = 9999;

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
  const normalizedPages = pages.length > 0 ? pages : [createDefaultPageModel()];

  return {
    version: '2.0',
    projectId,
    activePageId: activePageId ?? normalizedPages[0]?.id ?? null,
    pages: normalizedPages.map((page) => ({
      id: page.id,
      name: page.name,
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
  return buildCanvasProjectDocument(
    [
      {
        id: crypto.randomUUID(),
        name: 'Page 1',
        elements: legacyElements,
      },
    ],
    projectId,
    null,
  );
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
    version: '1.0',
    id: rootId,
    type: ROOT_TYPE,
    props: {
      projectId,
      role: ROOT_ROLE,
      ...(pageName ? { pageName } : {}),
    },
    layout: {
      mode: 'stack',
      direction: 'column',
    },
    style: {
      width: '100%',
      height: '100%',
    },
    responsive: {},
    children,
  };
}

function mapCanvasElementToIR(element: CanvasElement): IRNode {
  const primitiveType = mapElementType(element.type);

  return {
    version: '1.0',
    id: element.id,
    type: primitiveType,
    props: buildNodeProps(element, primitiveType),
    style: buildNodeStyle(element),
    responsive: {},
    children: [],
  };
}

function buildNodeStyle(element: CanvasElement): IRStyle {
  const style: IRStyle = {
    width: `${element.width}px`,
    height: `${element.height}px`,
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
      style.border = `${strokeWidth}px solid ${element.stroke}`;
    }
  }

  if (typeof element.opacity === 'number') {
    style.opacity = element.opacity;
  }

  if (element.type === 'circle') {
    style.borderRadius = CIRCLE_RADIUS;
  } else if (typeof element.cornerRadius === 'number') {
    style.borderRadius = element.cornerRadius;
  }

  if (element.type === 'text' && element.fontSize) {
    style.fontSize = element.fontSize;
  }

  if (element.type === 'text') {
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
      style.lineHeight = element.lineHeight;
    }

    if (typeof element.letterSpacing === 'number') {
      style.letterSpacing = element.letterSpacing;
    }
  }

  return style;
}

function buildNodeProps(element: CanvasElement, primitiveType: string): Record<string, unknown> {
  const props: Record<string, unknown> = {
    ...(element.irMeta?.props ?? {}),
    x: element.x,
    y: element.y,
    visible: element.visible !== false,
    primitive: true,
  };

  if (element.type === 'text') {
    props['content'] = element.text ?? '';
    props['textVerticalAlign'] = element.textVerticalAlign ?? 'middle';
  }

  if (element.type === 'image') {
    props['src'] = element.imageUrl ?? '';
  }

  if (element.irMeta?.type && element.irMeta.type !== primitiveType) {
    props['sourceType'] = element.irMeta.type;
  }

  if (typeof element.name === 'string') {
    props['name'] = element.name;
  }

  if (element.type !== 'text') {
    props['strokeWidth'] =
      typeof element.strokeWidth === 'number' ? element.strokeWidth : DEFAULT_STROKE_WIDTH;
    props['strokePosition'] = element.strokePosition ?? DEFAULT_STROKE_POSITION;
  }

  return props;
}

function mapElementType(type: CanvasElement['type']): string {
  switch (type) {
    case 'frame':
      return 'Frame';
    case 'rectangle':
    case 'circle':
      return 'Container';
    case 'text':
      return 'Text';
    case 'image':
      return 'Image';
    default:
      return 'Frame';
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
    x: readNumericProp(node.props, 'x', DEFAULT_POSITION),
    y: readNumericProp(node.props, 'y', DEFAULT_POSITION),
    width: readSize(node.style, 'width', defaults.width),
    height: readSize(node.style, 'height', defaults.height),
    visible: readBooleanProp(node.props, 'visible', true),
    fill:
      mappedType !== 'text'
        ? (node.style?.background ?? (mappedType === 'frame' ? DEFAULT_FRAME_FILL : DEFAULT_FILL))
        : undefined,
    stroke: readBorderColor(node.style?.border),
    strokeWidth:
      mappedType !== 'text'
        ? readStrokeWidth(node.style?.border, node.props, DEFAULT_STROKE_WIDTH)
        : undefined,
    strokePosition:
      mappedType !== 'text' ? readStrokePosition(node.props, DEFAULT_STROKE_POSITION) : undefined,
    opacity: readNumber(node.style?.opacity, DEFAULT_OPACITY),
    cornerRadius:
      mappedType !== 'circle' && mappedType !== 'text'
        ? readNumber(node.style?.borderRadius, mappedType === 'image' ? DEFAULT_IMAGE_RADIUS : 0)
        : undefined,
    text: mappedType === 'text' ? readStringProp(node.props, 'content', 'New text') : undefined,
    fontSize: mappedType === 'text' ? readNumber(node.style?.fontSize, 16) : undefined,
    fontFamily:
      mappedType === 'text'
        ? (readOptionalStringStyle(node.style, 'fontFamily') ?? 'Inter')
        : undefined,
    fontWeight: mappedType === 'text' ? readNumber(node.style?.fontWeight, 400) : undefined,
    fontStyle: mappedType === 'text' ? readFontStyle(node.style?.fontStyle, 'normal') : undefined,
    textAlign: mappedType === 'text' ? readTextAlign(node.style?.textAlign, 'center') : undefined,
    textVerticalAlign:
      mappedType === 'text'
        ? readTextVerticalAlign(node.props, 'textVerticalAlign', 'middle')
        : undefined,
    letterSpacing: mappedType === 'text' ? readNumber(node.style?.letterSpacing, 0) : undefined,
    lineHeight: mappedType === 'text' ? readNumber(node.style?.lineHeight, 1.2) : undefined,
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
    elements: [],
  };
}

function readBooleanProp(
  props: Record<string, unknown> | undefined,
  key: string,
  fallback: boolean,
): boolean {
  const value = props?.[key];
  return typeof value === 'boolean' ? value : fallback;
}

function readOptionalStringStyle(
  style: IRStyle | undefined,
  key: keyof IRStyle,
): string | undefined {
  const value = style?.[key];
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}

function readFontStyle(value: unknown, fallback: 'normal' | 'italic'): 'normal' | 'italic' {
  return value === 'italic' ? 'italic' : fallback;
}

function readTextAlign(
  value: unknown,
  fallback: 'left' | 'center' | 'right',
): 'left' | 'center' | 'right' {
  return value === 'left' || value === 'center' || value === 'right' ? value : fallback;
}

function readTextVerticalAlign(
  props: Record<string, unknown> | undefined,
  key: string,
  fallback: 'top' | 'middle' | 'bottom',
): 'top' | 'middle' | 'bottom' {
  const value = props?.[key];
  return value === 'top' || value === 'middle' || value === 'bottom' ? value : fallback;
}

function readSize(style: IRStyle | undefined, key: 'width' | 'height', fallback: number): number {
  const value = style?.[key];
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function readNumericProp(
  props: Record<string, unknown> | undefined,
  key: string,
  fallback: number,
): number {
  const value = props?.[key];
  return readNumber(value, fallback);
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

function readBorderColor(border: string | undefined): string | undefined {
  if (!border) {
    return undefined;
  }

  const tokens = border.trim().split(/\s+/);
  if (tokens.length === 0) {
    return undefined;
  }

  const lastToken = tokens[tokens.length - 1];
  if (isColorToken(lastToken)) {
    return lastToken;
  }

  if (isColorToken(border.trim())) {
    return border.trim();
  }

  return undefined;
}

function readStrokeWidth(
  border: string | undefined,
  props: Record<string, unknown> | undefined,
  fallback: number,
): number {
  const propStrokeWidth = readNumber(props?.['strokeWidth'], fallback);
  if (!border) {
    return propStrokeWidth;
  }

  const match = border.trim().match(/^(\d+(\.\d+)?)px/i);
  if (!match) {
    return propStrokeWidth;
  }

  const parsed = Number.parseFloat(match[1]);
  return Number.isFinite(parsed) ? parsed : propStrokeWidth;
}

function readStrokePosition(
  props: Record<string, unknown> | undefined,
  fallback: CanvasStrokePosition,
): CanvasStrokePosition {
  const value = props?.['strokePosition'];
  return value === 'outside' ? 'outside' : fallback;
}

function isColorToken(value: string): boolean {
  return (
    value.startsWith('#') ||
    value.startsWith('rgb') ||
    value.startsWith('hsl') ||
    value.startsWith('var(')
  );
}
