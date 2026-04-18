import { CanvasElement } from '@app/core';

export function collectFrameSubtree(
  frameId: string,
  allElements: CanvasElement[],
): CanvasElement[] {
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

export function syncBreakpointElements(
  breakpointElements: CanvasElement[],
  breakpointFrameId: string,
  primaryFrame: CanvasElement,
  primaryElements: CanvasElement[],
): CanvasElement[] {
  const primaryById = new Map<string, CanvasElement>();
  for (const el of primaryElements) {
    primaryById.set(el.id, el);
  }

  // Build a complete ID remap (mobile element ID → primary element ID) so that
  // parentId references are remapped consistently for the entire subtree, not
  // just direct children of the frame root.
  const idRemap = new Map<string, string>();
  idRemap.set(breakpointFrameId, primaryFrame.id);
  for (const el of breakpointElements) {
    if (el.primarySyncId) {
      idRemap.set(el.id, el.primarySyncId);
    }
  }

  return breakpointElements.map((el) => {
    if (el.id === breakpointFrameId) {
      return { ...primaryFrame, id: primaryFrame.id, parentId: el.parentId };
    }
    const remappedParentId = el.parentId ? (idRemap.get(el.parentId) ?? el.parentId) : el.parentId;
    if (el.primarySyncId) {
      const primaryEl = primaryById.get(el.primarySyncId);
      if (primaryEl) {
        // Element is an unmodified synced copy — use the primary element's exact
        // properties so code generation produces no diff for it.
        return { ...primaryEl, parentId: remappedParentId };
      }
      return { ...el, id: el.primarySyncId, parentId: remappedParentId };
    }
    return { ...el, parentId: remappedParentId };
  });
}
