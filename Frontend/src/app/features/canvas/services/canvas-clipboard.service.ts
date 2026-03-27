import { Injectable } from '@angular/core';
import { CanvasElement } from '../../../core/models/canvas.models';
import { roundToTwoDecimals, clamp, collectSubtreeIds } from '../utils/canvas-interaction.util';
import { CanvasClipboardSnapshot, Bounds } from '../canvas.types';

const PASTE_OFFSET = 24;

@Injectable()
export class CanvasClipboardService {
  private snapshot: CanvasClipboardSnapshot | null = null;

  get hasClipboard(): boolean {
    return this.snapshot !== null;
  }

  // ── Copy ──────────────────────────────────────────────────

  copySubtree(selectedId: string, elements: CanvasElement[], currentPageId: string | null): void {
    const subtreeIds = new Set(collectSubtreeIds(elements, selectedId));
    const copiedElements = elements
      .filter((element) => subtreeIds.has(element.id))
      .map((element) => structuredClone(element));

    if (copiedElements.length === 0) {
      return;
    }

    this.snapshot = {
      rootId: selectedId,
      sourcePageId: currentPageId,
      pasteCount: 0,
      elements: copiedElements,
    };
  }

  // ── Paste ─────────────────────────────────────────────────

  paste(currentElements: CanvasElement[], targetParentId: string | null): CanvasElement[] | null {
    const clipboard = this.snapshot;
    if (!clipboard) {
      return null;
    }

    const rootElement = clipboard.elements.find((element) => element.id === clipboard.rootId);
    if (!rootElement) {
      return null;
    }

    const pastedElements = this.createPastedElements(clipboard, currentElements, targetParentId);
    if (pastedElements.length === 0) {
      return null;
    }

    this.snapshot = {
      ...clipboard,
      pasteCount: clipboard.pasteCount + 1,
    };

    return pastedElements;
  }

  resolvePasteParentId(
    currentElements: CanvasElement[],
    selectedFrame: CanvasElement | null,
  ): { parentId: string | null; error: string | null } {
    const clipboard = this.snapshot;
    if (!clipboard) {
      return { parentId: null, error: null };
    }

    const rootElement = clipboard.elements.find((element) => element.id === clipboard.rootId);
    if (!rootElement) {
      return { parentId: null, error: null };
    }

    if (rootElement.type === 'frame') {
      return { parentId: null, error: null };
    }

    const originalParentId = rootElement.parentId ?? null;
    if (
      originalParentId &&
      currentElements.some((element) => element.id === originalParentId && element.type === 'frame')
    ) {
      return { parentId: originalParentId, error: null };
    }

    if (selectedFrame) {
      return { parentId: selectedFrame.id, error: null };
    }

    return {
      parentId: null,
      error: 'Select a destination frame before pasting this element.',
    };
  }

  // ── Private ───────────────────────────────────────────────

  private createPastedElements(
    clipboard: CanvasClipboardSnapshot,
    currentElements: CanvasElement[],
    targetParentId: string | null,
  ): CanvasElement[] {
    const rootElement = clipboard.elements.find((element) => element.id === clipboard.rootId);
    if (!rootElement) {
      return [];
    }

    const idMap = new Map(clipboard.elements.map((element) => [element.id, crypto.randomUUID()]));
    const targetParent = targetParentId
      ? (currentElements.find((element) => element.id === targetParentId) ?? null)
      : null;
    const offset = PASTE_OFFSET * (clipboard.pasteCount + 1);

    return clipboard.elements.map((element) => {
      const cloned = structuredClone(element);
      cloned.id = idMap.get(element.id) ?? crypto.randomUUID();

      if (element.id === clipboard.rootId) {
        cloned.parentId = targetParentId;

        if (targetParent) {
          cloned.x = clamp(element.x + offset, 0, targetParent.width - element.width);
          cloned.y = clamp(element.y + offset, 0, targetParent.height - element.height);
        } else {
          cloned.x = roundToTwoDecimals(element.x + offset);
          cloned.y = roundToTwoDecimals(element.y + offset);
        }

        return cloned;
      }

      cloned.parentId = element.parentId ? (idMap.get(element.parentId) ?? null) : null;
      return cloned;
    });
  }
}
