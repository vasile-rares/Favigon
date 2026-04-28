import { CanvasElement } from '@app/core';

export function buildElementMap(elements: CanvasElement[]): Map<string, CanvasElement> {
  const map = new Map<string, CanvasElement>();
  for (const el of elements) {
    map.set(el.id, el);
  }
  return map;
}

export function buildChildrenMap(elements: CanvasElement[]): Map<string | null, CanvasElement[]> {
  const map = new Map<string | null, CanvasElement[]>();
  for (const el of elements) {
    const key = el.parentId ?? null;
    const arr = map.get(key);
    if (arr) {
      arr.push(el);
    } else {
      map.set(key, [el]);
    }
  }
  return map;
}

export function getAbsolutePos(
  element: CanvasElement,
  elements: CanvasElement[],
  elementMap?: Map<string, CanvasElement>,
): { x: number; y: number } {
  if (!element.parentId || element.type === 'frame') {
    return { x: element.x, y: element.y };
  }

  const parent = elementMap
    ? (elementMap.get(element.parentId) ?? null)
    : (elements.find((e) => e.id === element.parentId) ?? null);
  if (!parent) {
    return { x: element.x, y: element.y };
  }

  const parentPos = getAbsolutePos(parent, elements, elementMap);
  return {
    x: parentPos.x + element.x,
    y: parentPos.y + element.y,
  };
}

export function collectSubtreeIds(
  elements: CanvasElement[],
  rootId: string,
  childrenMap?: Map<string | null, CanvasElement[]>,
): string[] {
  const collected: string[] = [];

  const visit = (currentId: string): void => {
    collected.push(currentId);
    const children = childrenMap
      ? (childrenMap.get(currentId) ?? [])
      : elements.filter((child) => (child.parentId ?? null) === currentId);
    for (const child of children) {
      visit(child.id);
    }
  };

  visit(rootId);
  return collected;
}

export function removeWithChildren(elements: CanvasElement[], rootId: string): CanvasElement[] {
  const idsToRemove = new Set(collectSubtreeIds(elements, rootId));
  return elements.filter((element) => !idsToRemove.has(element.id));
}
