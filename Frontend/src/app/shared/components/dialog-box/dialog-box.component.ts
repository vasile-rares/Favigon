import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  Component,
  ContentChild,
  EventEmitter,
  Input,
  OnDestroy,
  OnInit,
  Output,
  TemplateRef,
} from '@angular/core';
import { ActionButtonComponent } from '../button/action-button.component';

export interface DialogBoxField {
  key: string;
  label: string;
  type?: 'text' | 'password' | 'email' | 'number';
  placeholder?: string;
  initialValue?: string;
}

export interface DialogBoxAction {
  label: string;
  variant?: 'primary' | 'outline';
  disabled?: boolean;
}

const CLOSE_ANIMATION_DURATION_MS = 120;

@Component({
  selector: 'app-dialog-box',
  standalone: true,
  imports: [CommonModule, FormsModule, ActionButtonComponent],
  templateUrl: './dialog-box.component.html',
  styleUrl: './dialog-box.component.css',
})
export class DialogBoxComponent implements OnInit, OnDestroy {
  @Input() title = '';
  @Input() description?: string;
  @Input() fields: DialogBoxField[] = [];
  @Input() primaryAction?: DialogBoxAction;
  @Input() secondaryAction?: DialogBoxAction;

  @Input() blurBackdrop = true;
  @Input() closeOnBackdropClick = true;
  @Input() showCloseButton = true;
  @Input() width = '400px';
  @Input() ariaLabel?: string;
  @Input() isBusy = false;

  @Output() closed = new EventEmitter<void>();
  @Output() primaryClicked = new EventEmitter<Record<string, string>>();
  @Output() secondaryClicked = new EventEmitter<void>();

  @ContentChild('dialogFooter') footerTemplate?: TemplateRef<void>;

  fieldValues: Record<string, string> = {};

  private shouldCloseFromBackdropClick = false;
  private closeTimeoutId: ReturnType<typeof setTimeout> | null = null;

  isClosing = false;

  ngOnInit(): void {
    this.fieldValues = {};
    for (const field of this.fields) {
      this.fieldValues[field.key] = field.initialValue ?? '';
    }
  }

  get hasHeader(): boolean {
    return !!this.title || !!this.description;
  }

  get hasFooter(): boolean {
    return !!this.footerTemplate || !!this.primaryAction || !!this.secondaryAction;
  }

  onPrimaryClick(): void {
    if (this.isBusy || this.isClosing) return;
    this.primaryClicked.emit({ ...this.fieldValues });
  }

  onSecondaryClick(): void {
    if (this.isBusy || this.isClosing) return;
    this.secondaryClicked.emit();
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

export const DIALOG_BOX_IMPORTS = [DialogBoxComponent] as const;
