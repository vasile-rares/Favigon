import {
  Component,
  ElementRef,
  HostListener,
  OnDestroy,
  OnInit,
  effect,
  inject,
  input,
  output,
} from '@angular/core';

export interface ContextMenuItem {
  id: string;
  label: string;
  checked?: boolean;
  showCheckSlot?: boolean;
  shortcut?: string;
  variant?: 'danger';
  disabled?: boolean;
  /** Render a separator line before this item */
  separator?: boolean;
  children?: ContextMenuItem[];
  action?: () => void;
}

export type ContextMenuVerticalDirection = 'below' | 'above';

@Component({
  selector: 'app-context-menu',
  standalone: true,
  imports: [],
  templateUrl: './context-menu.component.html',
  styleUrl: './context-menu.component.css',
})
export class ContextMenuComponent implements OnInit, OnDestroy {
  readonly x = input(0);
  readonly y = input(0);
  readonly items = input<ContextMenuItem[]>([]);
  readonly verticalDirection = input<ContextMenuVerticalDirection>('below');
  readonly submenuDirection = input<'left' | 'right'>('right');

  readonly closed = output<void>();

  adjustedX = 0;
  adjustedY = 0;
  openSubmenuId: string | null = null;
  isClosing = false;
  private closeTimeout: ReturnType<typeof setTimeout> | null = null;

  private readonly el = inject<ElementRef<HTMLElement>>(ElementRef);

  private readonly onDocumentPointerDownCapture = (event: PointerEvent): void => {
    if (!this.el.nativeElement.contains(event.target as Node)) {
      this.requestClose();
    }
  };

  constructor() {
    effect(() => {
      const _x = this.x();
      const _y = this.y();
      const _items = this.items();
      const _dir = this.verticalDirection();
      this.isClosing = false;
      this.openSubmenuId = null;
      this.adjustPosition();
    });
  }

  ngOnInit(): void {
    document.addEventListener('pointerdown', this.onDocumentPointerDownCapture, true);
  }

  ngOnDestroy(): void {
    document.removeEventListener('pointerdown', this.onDocumentPointerDownCapture, true);
    if (this.closeTimeout) {
      clearTimeout(this.closeTimeout);
      this.closeTimeout = null;
    }
  }

  private adjustPosition(): void {
    this.adjustedX = this.x();
    this.adjustedY = this.y();

    requestAnimationFrame(() => {
      const panel = this.el.nativeElement.querySelector('.context-menu__panel') as HTMLElement;
      if (!panel) return;

      const rect = panel.getBoundingClientRect();
      const vw = window.innerWidth;
      const vh = window.innerHeight;

      this.adjustedY =
        this.verticalDirection() === 'above' ? Math.max(8, this.y() - rect.height) : this.y();

      if (rect.right > vw) this.adjustedX = Math.max(0, this.x() - rect.width);
      if (this.verticalDirection() === 'below' && rect.bottom > vh) {
        this.adjustedY = Math.max(0, this.y() - rect.height);
      }
    });
  }

  onItemClick(item: ContextMenuItem): void {
    if (item.disabled || item.children?.length) return;
    item.action?.();
    this.requestClose();
  }

  onSubmenuItemClick(item: ContextMenuItem): void {
    if (item.disabled) return;
    item.action?.();
    this.openSubmenuId = null;
    this.requestClose();
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.requestClose();
  }

  requestClose(): void {
    if (this.isClosing) {
      return;
    }

    this.isClosing = true;
    this.closeTimeout = setTimeout(() => {
      this.closeTimeout = null;
      this.closed.emit();
    }, 120);
  }
}
