import { Injectable, computed, signal } from '@angular/core';
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
  readonly editingTextElementId = signal<string | null>(null);
  readonly currentTool = signal<CanvasElementType | 'select'>('select');

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
}
