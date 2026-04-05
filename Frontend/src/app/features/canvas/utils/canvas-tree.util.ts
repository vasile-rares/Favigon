import { CanvasElement } from '@app/core';

export function getAbsolutePos(
  element: CanvasElement,
  elements: CanvasElement[],
): { x: number; y: number } {
  if (!element.parentId || element.type === 'frame') {
    return { x: element.x, y: element.y };
  }

  const parent = elements.find((e) => e.id === element.parentId);
  if (!parent) {
    return { x: element.x, y: element.y };
  }

  const parentPos = getAbsolutePos(parent, elements);
  return {
    x: parentPos.x + element.x,
    y: parentPos.y + element.y,
  };
}

export function collectSubtreeIds(elements: CanvasElement[], rootId: string): string[] {
  const collected: string[] = [];

  const visit = (currentId: string): void => {
    collected.push(currentId);
    for (const child of elements) {
      if ((child.parentId ?? null) === currentId) {
        visit(child.id);
      }
    }
  };

  visit(rootId);
  return collected;
}

export function removeWithChildren(elements: CanvasElement[], rootId: string): CanvasElement[] {
  const idsToRemove = new Set(collectSubtreeIds(elements, rootId));
  return elements.filter((element) => !idsToRemove.has(element.id));
}
