import { CommonModule } from '@angular/common';
import {
  AfterViewInit,
  Component,
  ElementRef,
  EventEmitter,
  Input,
  OnChanges,
  Output,
  SimpleChanges,
  ViewChild,
} from '@angular/core';

@Component({
  selector: 'app-style-popup-overlay',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './style-popup-overlay.component.html',
  styleUrl: './style-popup-overlay.component.css',
})
export class StylePopupOverlayComponent {
  @Input() open = false;
  @Input() top: number | null = 16;
  @Input() bottom: number | null = null;
  @Input() left = 16;
  @Input() width = 248;
  @Input() title = '';

  @Output() closeRequested = new EventEmitter<void>();

  @ViewChild('popoverElement') private popoverElement?: ElementRef<HTMLDivElement>;

  ngAfterViewInit(): void {
    this.syncOpenState();
  }

  ngOnChanges(_changes: SimpleChanges): void {
    this.syncOpenState();
  }

  onCloseClick(): void {
    this.closeRequested.emit();
  }

  private syncOpenState(): void {
    const popover = this.popoverElement?.nativeElement as
      | (HTMLDivElement & {
          showPopover?: () => void;
          hidePopover?: () => void;
          matches(selectors: string): boolean;
        })
      | undefined;

    if (
      !popover ||
      typeof popover.showPopover !== 'function' ||
      typeof popover.hidePopover !== 'function'
    ) {
      return;
    }

    if (this.open) {
      if (!popover.matches(':popover-open')) {
        popover.showPopover();
      }
      return;
    }

    if (popover.matches(':popover-open')) {
      popover.hidePopover();
    }
  }
}
