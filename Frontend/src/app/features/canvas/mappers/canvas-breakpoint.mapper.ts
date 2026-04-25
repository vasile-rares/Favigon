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

  // Build sibling-order maps for position-based matching.
  // Elements that were modified in the breakpoint (primarySyncId cleared) lose their
  // explicit link to the primary counterpart.  Re-establish it by matching on
  // parent + sibling-index so they get the same CSS class name and generate only a
  // diff instead of appearing as a fully-exclusive (hidden) node.
  const primaryChildrenByParent = new Map<string, string[]>();
  for (const el of primaryElements) {
    if (el.parentId) {
      const siblings = primaryChildrenByParent.get(el.parentId);
      if (siblings) {
        siblings.push(el.id);
      } else {
        primaryChildrenByParent.set(el.parentId, [el.id]);
      }
    }
  }

  const bpChildrenByParent = new Map<string, string[]>();
  for (const el of breakpointElements) {
    if (el.parentId) {
      const siblings = bpChildrenByParent.get(el.parentId);
      if (siblings) {
        siblings.push(el.id);
      } else {
        bpChildrenByParent.set(el.parentId, [el.id]);
      }
    }
  }

  // Iteratively remap detached elements (no primarySyncId) by tree position.
  // Repeat until stable so deeply-nested detached elements are covered too.
  let changed = true;
  while (changed) {
    changed = false;
    for (const el of breakpointElements) {
      if (el.primarySyncId || el.id === breakpointFrameId || !el.parentId || idRemap.has(el.id)) {
        continue;
      }
      const remappedParentId = idRemap.get(el.parentId);
      if (!remappedParentId) continue; // parent not yet resolved — retry next iteration

      const bpSiblings = bpChildrenByParent.get(el.parentId) ?? [];
      const siblingIndex = bpSiblings.indexOf(el.id);
      if (siblingIndex < 0) continue;

      const primarySiblings = primaryChildrenByParent.get(remappedParentId) ?? [];
      const matchedPrimaryId = primarySiblings[siblingIndex];
      if (matchedPrimaryId) {
        idRemap.set(el.id, matchedPrimaryId);
        changed = true;
      }
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
    // Position-matched detached element: keep breakpoint properties but use the
    // primary element's ID so both share the same CSS class and only the diff
    // (e.g. flex-direction change) is emitted inside the @media block.
    const remappedId = idRemap.get(el.id);
    if (remappedId) {
      return { ...el, id: remappedId, parentId: remappedParentId };
    }
    return { ...el, parentId: remappedParentId };
  });
}
