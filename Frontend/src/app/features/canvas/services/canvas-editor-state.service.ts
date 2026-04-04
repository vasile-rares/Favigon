import { Injectable, computed, effect, signal } from '@angular/core';
import {
  CanvasElement,
  CanvasElementType,
  CanvasPageModel,
} from '../../../core/models/canvas.models';

@Injectable()
export class CanvasEditorStateService {
  readonly pages = signal<CanvasPageModel[]>([]);
  readonly currentPageId = signal<string | null>(null);
  readonly selectedElementId = signal<string | null>(null);
  readonly selectedElementIds = signal<string[]>([]);
  readonly editingTextElementId = signal<string | null>(null);
  readonly currentTool = signal<CanvasElementType | 'select'>('select');

  constructor() {
    effect(
      () => {
        const elements = this.elements();
        const availableIds = new Set(elements.map((element) => element.id));
        const primaryId = this.selectedElementId();
        const normalizedPrimaryId = primaryId && availableIds.has(primaryId) ? primaryId : null;

        if (primaryId !== normalizedPrimaryId) {
          this.selectedElementId.set(normalizedPrimaryId);
          return;
        }

        const currentSelectedIds = this.selectedElementIds();
        const normalizedSelectedIds = currentSelectedIds.filter((id) => availableIds.has(id));

        if (normalizedPrimaryId === null) {
          if (currentSelectedIds.length > 0) {
            this.selectedElementIds.set([]);
          }
          return;
        }

        if (normalizedSelectedIds.length === 0) {
          this.selectedElementIds.set([normalizedPrimaryId]);
          return;
        }

        if (!normalizedSelectedIds.includes(normalizedPrimaryId)) {
          this.selectedElementIds.set([normalizedPrimaryId]);
          return;
        }

        if (!sameStringArray(currentSelectedIds, normalizedSelectedIds)) {
          this.selectedElementIds.set(normalizedSelectedIds);
        }
      },
      { allowSignalWrites: true },
    );
  }

  readonly currentPage = computed<CanvasPageModel | null>(() => {
    const activePageId = this.currentPageId();
    if (!activePageId) return this.pages()[0] ?? null;
    return this.pages().find((p) => p.id === activePageId) ?? this.pages()[0] ?? null;
  });

  readonly elements = computed<CanvasElement[]>(() => this.currentPage()?.elements ?? []);

  readonly selectedElement = computed<CanvasElement | null>(() => {
    const selectedId = this.selectedElementId();
    if (!selectedId) return null;
    return this.elements().find((el) => el.id === selectedId) ?? null;
  });

  readonly selectedElements = computed<CanvasElement[]>(() => {
    const selectedIds = new Set(this.selectedElementIds());
    if (selectedIds.size === 0) {
      return [];
    }

    return this.elements().filter((element) => selectedIds.has(element.id));
  });
}

function sameStringArray(left: string[], right: string[]): boolean {
  if (left.length !== right.length) {
    return false;
  }

  return left.every((value, index) => value === right[index]);
}
