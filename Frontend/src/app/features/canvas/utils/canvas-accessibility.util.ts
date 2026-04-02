import {
  CanvasElement,
  CanvasElementType,
  CanvasSemanticTag,
} from '../../../core/models/canvas.models';

const CONTAINER_TAGS: readonly CanvasSemanticTag[] = [
  'div',
  'section',
  'article',
  'aside',
  'main',
  'header',
  'footer',
  'nav',
];

const TEXT_TAGS: readonly CanvasSemanticTag[] = ['p', 'span', 'div', 'label'];
const IMAGE_TAGS: readonly CanvasSemanticTag[] = ['img'];
const NO_TAGS: readonly CanvasSemanticTag[] = [];

const DEFAULT_TAG_BY_TYPE: Record<CanvasElementType, CanvasSemanticTag> = {
  frame: 'section',
  rectangle: 'div',
  text: 'p',
  image: 'img',
};

export function hasCanvasElementLink(element: Pick<CanvasElement, 'linkType'>): boolean {
  return element.linkType === 'page' || element.linkType === 'url';
}

export function supportsCustomAccessibilityTag(type: CanvasElementType): boolean {
  return getAllowedCustomAccessibilityTags(type).length > 0;
}

export function getAllowedCustomAccessibilityTags(
  type: CanvasElementType,
): readonly CanvasSemanticTag[] {
  switch (type) {
    case 'frame':
    case 'rectangle':
      return CONTAINER_TAGS;
    case 'text':
      return TEXT_TAGS;
    case 'image':
      return IMAGE_TAGS;
    default:
      return NO_TAGS;
  }
}

export function getDefaultAccessibilityTag(type: CanvasElementType): CanvasSemanticTag {
  return DEFAULT_TAG_BY_TYPE[type];
}

export function normalizeStoredCanvasTag(
  type: CanvasElementType,
  tag: string | null | undefined,
  hasLink: boolean,
): CanvasSemanticTag | undefined {
  if (hasLink) {
    return undefined;
  }

  const normalized = typeof tag === 'string' ? tag.trim().toLowerCase() : '';
  if (!normalized) {
    return undefined;
  }

  const allowedTags = getAllowedCustomAccessibilityTags(type);
  return allowedTags.includes(normalized as CanvasSemanticTag)
    ? (normalized as CanvasSemanticTag)
    : undefined;
}

export function getResolvedCanvasTag(
  element: Pick<CanvasElement, 'type' | 'tag' | 'linkType'>,
): CanvasSemanticTag | undefined {
  if (hasCanvasElementLink(element)) {
    return 'a';
  }

  return normalizeStoredCanvasTag(element.type, element.tag, false);
}

export function normalizeCanvasAccessibilityLabel(
  value: string | null | undefined,
): string | undefined {
  const normalized = typeof value === 'string' ? value.trim() : '';
  return normalized.length > 0 ? normalized : undefined;
}
