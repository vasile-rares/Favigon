import { CanvasElement, CanvasStrokePosition } from '../models/canvas.models';
import { IRNode, IRStyle } from '../models/ir.models';

const ROOT_ROLE = 'canvas-root';
const ROOT_TYPE = 'Container';
const MANAGED_PROP_KEYS = [
  'x',
  'y',
  'content',
  'src',
  'strokePosition',
  'strokeWidth',
  'name',
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

export function buildCanvasIR(elements: CanvasElement[], projectId: string): IRNode {
  const rootId = `canvas-${projectId}`;
  const nodesById = createNodeIndex(elements);
  const rootChildren = resolveRootChildren(elements, nodesById, rootId);

  return createRootNode(projectId, rootId, rootChildren);
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

function createRootNode(projectId: string, rootId: string, children: IRNode[]): IRNode {
  return {
    version: '1.0',
    id: rootId,
    type: ROOT_TYPE,
    props: {
      projectId,
      role: ROOT_ROLE,
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

  return style;
}

function buildNodeProps(element: CanvasElement, primitiveType: string): Record<string, unknown> {
  const props: Record<string, unknown> = {
    ...(element.irMeta?.props ?? {}),
    x: element.x,
    y: element.y,
    primitive: true,
  };

  if (element.type === 'text') {
    props['content'] = element.text ?? '';
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
