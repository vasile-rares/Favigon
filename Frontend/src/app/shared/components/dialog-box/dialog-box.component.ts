import { CommonModule } from '@angular/common';
import {
  Component,
  ContentChild,
  Directive,
  EventEmitter,
  Input,
  OnDestroy,
  Output,
} from '@angular/core';

const CLOSE_ANIMATION_DURATION_MS = 120;

@Directive({
  selector: '[dialogTitle]',
  standalone: true,
})
export class DialogBoxTitleDirective {}

@Directive({
  selector: '[dialogDescription]',
  standalone: true,
})
export class DialogBoxDescriptionDirective {}

@Directive({
  selector: '[dialogFooter]',
  standalone: true,
})
export class DialogBoxFooterDirective {}

@Component({
  selector: 'app-dialog-box',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './dialog-box.component.html',
  styleUrl: './dialog-box.component.css',
})
export class DialogBoxComponent implements OnDestroy {
  @Input() blurBackdrop = true;
  @Input() closeOnBackdropClick = true;
  @Input() showCloseButton = true;
  @Input() width = '400px';
  @Input() ariaLabelledBy?: string;
  @Input() ariaLabel?: string;
  @Input() isBusy = false;

  @Output() closed = new EventEmitter<void>();

  @ContentChild(DialogBoxTitleDirective) private titleSlot?: DialogBoxTitleDirective;
  @ContentChild(DialogBoxDescriptionDirective)
  private descriptionSlot?: DialogBoxDescriptionDirective;
  @ContentChild(DialogBoxFooterDirective) private footerSlot?: DialogBoxFooterDirective;

  private shouldCloseFromBackdropClick = false;
  private closeTimeoutId: ReturnType<typeof setTimeout> | null = null;

  isClosing = false;

  get hasHeader(): boolean {
    return !!this.titleSlot || !!this.descriptionSlot;
  }

  get hasFooter(): boolean {
    return !!this.footerSlot;
  }

  requestClose(): void {
    if (this.isBusy || this.isClosing) {
      return;
    }

    this.isClosing = true;
    this.closeTimeoutId = setTimeout(() => {
      this.closeTimeoutId = null;
      this.closed.emit();
    }, CLOSE_ANIMATION_DURATION_MS);
  }

  onBackdropPointerDown(event: PointerEvent): void {
    if (!this.closeOnBackdropClick) {
      return;
    }

    this.shouldCloseFromBackdropClick = event.target === event.currentTarget;
  }

  onBackdropClick(event: MouseEvent): void {
    if (!this.closeOnBackdropClick) {
      return;
    }

    const isBackdropClick = event.target === event.currentTarget;
    if (!isBackdropClick || !this.shouldCloseFromBackdropClick) {
      this.shouldCloseFromBackdropClick = false;
      return;
    }

    this.shouldCloseFromBackdropClick = false;
    this.requestClose();
  }

  onDialogPointerDown(): void {
    this.shouldCloseFromBackdropClick = false;
  }

  ngOnDestroy(): void {
    if (!this.closeTimeoutId) {
      return;
    }

    clearTimeout(this.closeTimeoutId);
    this.closeTimeoutId = null;
  }
}

export const DIALOG_BOX_IMPORTS = [
  DialogBoxComponent,
  DialogBoxTitleDirective,
  DialogBoxDescriptionDirective,
  DialogBoxFooterDirective,
] as const;
