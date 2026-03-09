import { CommonModule } from '@angular/common';
import {
  Component,
  ElementRef,
  EventEmitter,
  HostListener,
  Input,
  OnChanges,
  OnDestroy,
  OnInit,
  Output,
  SimpleChanges,
} from '@angular/core';

export interface ContextMenuItem {
  id: string;
  label: string;
  shortcut?: string;
  variant?: 'danger';
  disabled?: boolean;
  /** Render a separator line before this item */
  separator?: boolean;
  children?: ContextMenuItem[];
  action?: () => void;
}

@Component({
  selector: 'app-context-menu',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './context-menu.component.html',
  styleUrl: './context-menu.component.css',
})
export class ContextMenuComponent implements OnChanges, OnInit, OnDestroy {
  @Input() x = 0;
  @Input() y = 0;
  @Input() items: ContextMenuItem[] = [];

  @Output() closed = new EventEmitter<void>();

  adjustedX = 0;
  adjustedY = 0;
  openSubmenuId: string | null = null;

  private readonly onDocumentPointerDownCapture = (event: PointerEvent): void => {
    if (!this.el.nativeElement.contains(event.target as Node)) {
      this.closed.emit();
    }
  };

  constructor(private readonly el: ElementRef<HTMLElement>) {}

  ngOnInit(): void {
    document.addEventListener('pointerdown', this.onDocumentPointerDownCapture, true);
  }

  ngOnDestroy(): void {
    document.removeEventListener('pointerdown', this.onDocumentPointerDownCapture, true);
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['x'] || changes['y']) {
      this.openSubmenuId = null;
      this.adjustPosition();
    }
  }

  private adjustPosition(): void {
    this.adjustedX = this.x;
    this.adjustedY = this.y;

    requestAnimationFrame(() => {
      const panel = this.el.nativeElement.querySelector('.context-menu__panel') as HTMLElement;
      if (!panel) return;

      const rect = panel.getBoundingClientRect();
      const vw = window.innerWidth;
      const vh = window.innerHeight;

      if (rect.right > vw) this.adjustedX = Math.max(0, this.x - rect.width);
      if (rect.bottom > vh) this.adjustedY = Math.max(0, this.y - rect.height);
    });
  }

  onItemClick(item: ContextMenuItem): void {
    if (item.disabled || item.children?.length) return;
    item.action?.();
    this.closed.emit();
  }

  onSubmenuItemClick(item: ContextMenuItem): void {
    if (item.disabled) return;
    item.action?.();
    this.openSubmenuId = null;
    this.closed.emit();
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.closed.emit();
  }
}
