import { Injectable, signal } from '@angular/core';
import { CanvasElement, CanvasPageModel } from '../../../core/models/canvas.models';
import {
  ContextMenuItem,
} from '../../../shared/components/context-menu/context-menu.component';

export interface ContextMenuActionCallbacks {
  getSelectedElementId: () => string | null;
  getSelectedElement: () => CanvasElement | null;
  getPages: () => CanvasPageModel[];
  getCurrentPageId: () => string | null;
  getElements: () => CanvasElement[];
  onCopy: () => void;
  onPaste: () => void;
  onDelete: (elementId: string) => void;
  onBringToFront: (elementId: string) => void;
  onSendToBack: (elementId: string) => void;
  onMoveToPage: (elementId: string, targetPageId: string) => void;
  onFlipHorizontal: (elementId: string) => void;
  onFlipVertical: (elementId: string) => void;
  onRename: (elementId: string) => void;
  onToggleVisibility: (elementId: string) => void;
  onSetAsPrimary: (elementId: string) => void;
}

@Injectable()
export class CanvasContextMenuService {
  readonly isOpen = signal(false);
  readonly positionX = signal(0);
  readonly positionY = signal(0);
  readonly items = signal<ContextMenuItem[]>([]);

  open(x: number, y: number, callbacks: ContextMenuActionCallbacks): void {
    this.items.set(this.buildItems(callbacks));
    this.positionX.set(x);
    this.positionY.set(y);
    this.isOpen.set(true);
  }

  close(): void {
    this.isOpen.set(false);
    this.items.set([]);
  }

  // ── Private Item Building ────────────────────────────────

  private buildItems(callbacks: ContextMenuActionCallbacks): ContextMenuItem[] {
    const element = callbacks.getSelectedElement();
    const hasElement = !!element;
    const isVisible = element?.visible !== false;
    const isRootFrame = element?.type === 'frame' && !element.parentId;
    const otherPages = callbacks
      .getPages()
      .filter((page) => page.id !== callbacks.getCurrentPageId());

    const guardAction = (action: (id: string) => void): (() => void) => {
      return () => {
        const id = callbacks.getSelectedElementId();
        if (id) {
          action(id);
        }
      };
    };

    return [
      // Clipboard group
      {
        id: 'copy',
        label: 'Copy',
        shortcut: 'Ctrl+C',
        disabled: !hasElement,
        action: () => callbacks.onCopy(),
      },
      {
        id: 'paste',
        label: 'Paste',
        shortcut: 'Ctrl+V',
        action: () => callbacks.onPaste(),
      },
      {
        id: 'delete',
        label: 'Delete',
        shortcut: 'Del',
        variant: 'danger' as const,
        disabled: !hasElement,
        action: guardAction((id) => callbacks.onDelete(id)),
      },

      // Order group
      {
        id: 'bring-front',
        label: 'Bring to Front',
        shortcut: 'Ctrl+]',
        disabled: !hasElement,
        separator: true,
        action: guardAction((id) => callbacks.onBringToFront(id)),
      },
      {
        id: 'send-back',
        label: 'Send to Back',
        shortcut: 'Ctrl+[',
        disabled: !hasElement,
        action: guardAction((id) => callbacks.onSendToBack(id)),
      },
      {
        id: 'move-to-page',
        label: 'Move to Page',
        disabled: !hasElement || otherPages.length === 0,
        children: otherPages.map((page) => ({
          id: `move-page-${page.id}`,
          label: page.name,
          action: guardAction((id) => callbacks.onMoveToPage(id, page.id)),
        })),
      },

      // Transform group
      {
        id: 'flip-h',
        label: 'Flip Horizontal',
        disabled: !hasElement,
        separator: true,
        action: guardAction((id) => callbacks.onFlipHorizontal(id)),
      },
      {
        id: 'flip-v',
        label: 'Flip Vertical',
        disabled: !hasElement,
        action: guardAction((id) => callbacks.onFlipVertical(id)),
      },

      // Element group
      {
        id: 'rename',
        label: 'Rename',
        shortcut: 'F2',
        disabled: !hasElement,
        separator: true,
        action: guardAction((id) => callbacks.onRename(id)),
      },
      {
        id: 'visibility',
        label: isVisible ? 'Hide' : 'Show',
        shortcut: 'Ctrl+Shift+H',
        disabled: !hasElement,
        action: guardAction((id) => callbacks.onToggleVisibility(id)),
      },

      // Primary frame group
      {
        id: 'set-primary',
        label: element?.isPrimary ? 'Primary Frame ✓' : 'Set as Primary Frame',
        disabled: !isRootFrame || !!element?.isPrimary,
        separator: true,
        action: guardAction((id) => callbacks.onSetAsPrimary(id)),
      },
    ];
  }
}
