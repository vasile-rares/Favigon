import { NgTemplateOutlet } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  Component,
  OnDestroy,
  OnInit,
  TemplateRef,
  contentChild,
  input,
  output,
} from '@angular/core';
import { ActionButtonComponent } from '../action-button/action-button.component';

export interface DialogBoxField {
  key: string;
  label: string;
  type?: 'text' | 'password' | 'email' | 'number';
  placeholder?: string;
  initialValue?: string;
}

export interface DialogBoxAction {
  label: string;
  variant?: 'primary' | 'outline' | 'danger';
  disabled?: boolean;
}

const CLOSE_ANIMATION_DURATION_MS = 120;

@Component({
  selector: 'app-dialog-box',
  standalone: true,
  imports: [FormsModule, NgTemplateOutlet, ActionButtonComponent],
  templateUrl: './dialog-box.component.html',
  styleUrl: './dialog-box.component.css',
})
export class DialogBoxComponent implements OnInit, OnDestroy {
  readonly title = input('');
  readonly description = input<string | undefined>(undefined);
  readonly fields = input<DialogBoxField[]>([]);
  readonly primaryAction = input<DialogBoxAction | undefined>(undefined);
  readonly secondaryAction = input<DialogBoxAction | undefined>(undefined);

  readonly blurBackdrop = input(true);
  readonly closeOnBackdropClick = input(true);
  readonly showCloseButton = input(true);
  readonly width = input('400px');
  readonly ariaLabel = input<string | undefined>(undefined);
  readonly isBusy = input(false);

  readonly closed = output<void>();
  readonly primaryClicked = output<Record<string, string>>();
  readonly secondaryClicked = output<void>();

  private readonly _contentFooterTemplate = contentChild<TemplateRef<void>>('dialogFooter');
  readonly footerTemplate = input<TemplateRef<void> | undefined>(undefined);

  get resolvedFooter(): TemplateRef<void> | undefined {
    return this.footerTemplate() ?? this._contentFooterTemplate();
  }

  fieldValues: Record<string, string> = {};

  private shouldCloseFromBackdropClick = false;
  private closeTimeoutId: ReturnType<typeof setTimeout> | null = null;

  isClosing = false;

  ngOnInit(): void {
    this.fieldValues = {};
    for (const field of this.fields()) {
      this.fieldValues[field.key] = field.initialValue ?? '';
    }
  }

  get hasHeader(): boolean {
    return !!this.title() || !!this.description();
  }

  get hasFooter(): boolean {
    return !!this.resolvedFooter || !!this.primaryAction() || !!this.secondaryAction();
  }

  onPrimaryClick(): void {
    if (this.isBusy() || this.isClosing) return;
    this.primaryClicked.emit({ ...this.fieldValues });
  }

  onSecondaryClick(): void {
    if (this.isBusy() || this.isClosing) return;
    this.secondaryClicked.emit();
  }

  requestClose(): void {
    if (this.isBusy() || this.isClosing) {
      return;
    }

    this.isClosing = true;
    this.closeTimeoutId = setTimeout(() => {
      this.closeTimeoutId = null;
      this.closed.emit();
    }, CLOSE_ANIMATION_DURATION_MS);
  }

  onBackdropPointerDown(event: PointerEvent): void {
    if (!this.closeOnBackdropClick()) {
      return;
    }

    this.shouldCloseFromBackdropClick = event.target === event.currentTarget;
  }

  onBackdropClick(event: MouseEvent): void {
    if (!this.closeOnBackdropClick()) {
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
