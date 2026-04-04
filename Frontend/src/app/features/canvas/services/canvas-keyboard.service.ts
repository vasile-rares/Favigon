import { Injectable, inject } from '@angular/core';
import { CanvasElementType } from '../../../core/models/canvas.models';
import { CanvasEditorStateService } from './canvas-editor-state.service';

export interface KeyboardActionCallbacks {
  onCopy: () => void;
  onPaste: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onDelete: () => void;
  onSelectTool: (tool: CanvasElementType | 'select') => void;
  onSpaceDown: () => void;
  onSpaceUp: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
}

const TOOL_HOTKEYS: Record<string, CanvasElementType | 'select'> = {
  v: 'select',
  f: 'frame',
  r: 'rectangle',
  t: 'text',
  i: 'image',
};

@Injectable()
export class CanvasKeyboardService {
  private readonly editorState = inject(CanvasEditorStateService);

  handleKeyDown(event: KeyboardEvent, callbacks: KeyboardActionCallbacks): void {
    if (event.defaultPrevented) {
      return;
    }

    const isTypingContext = this.isTypingContext(event);

    if (event.ctrlKey || event.metaKey) {
      const key = event.key;
      if (key === '+' || key === '=') {
        event.preventDefault();
        callbacks.onZoomIn();
        return;
      }
      if (key === '-') {
        event.preventDefault();
        callbacks.onZoomOut();
        return;
      }
    }

    if (!isTypingContext && (event.ctrlKey || event.metaKey)) {
      const key = event.key.toLowerCase();

      if (key === 'c') {
        event.preventDefault();
        callbacks.onCopy();
        return;
      }

      if (key === 'v') {
        event.preventDefault();
        callbacks.onPaste();
        return;
      }

      if (key === 'z' && !event.shiftKey) {
        event.preventDefault();
        callbacks.onUndo();
        return;
      }

      if (key === 'y' || (key === 'z' && event.shiftKey)) {
        event.preventDefault();
        callbacks.onRedo();
        return;
      }
    }

    if (this.editorState.editingTextElementId()) {
      return;
    }

    if (event.code === 'Space' && !isTypingContext) {
      callbacks.onSpaceDown();
      event.preventDefault();
      return;
    }

    if (isTypingContext) {
      return;
    }

    const toolKey = event.key.toLowerCase();
    const tool = TOOL_HOTKEYS[toolKey];
    if (tool) {
      callbacks.onSelectTool(tool);
    }

    if (event.key === 'Delete' || event.key === 'Backspace') {
      if (this.editorState.selectedElementIds().length === 0) {
        return;
      }
      callbacks.onDelete();
    }
  }

  handleKeyUp(event: KeyboardEvent, onSpaceUp: () => void): void {
    if (event.code === 'Space') {
      onSpaceUp();
    }
  }

  // ── Private Helpers ───────────────────────────────────────

  private isTypingContext(event: KeyboardEvent): boolean {
    return this.isTypingTarget(event.target);
  }

  private isTypingTarget(target: EventTarget | null): boolean {
    const element = target as HTMLElement | null;
    if (!element) {
      return false;
    }

    if (element.isContentEditable) {
      return true;
    }

    const tagName = element.tagName;
    return tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT';
  }
}
