import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnDestroy, Output } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { TextInputComponent } from '../../../../shared/components/input/text-input.component';
import { ActionButtonComponent } from '../../../../shared/components/button/action-button.component';
import {
  DropdownSelectComponent,
  DropdownSelectOption,
} from '../../../../shared/components/select/dropdown-select.component';

export interface NewProjectDialogSubmit {
  name: string;
  isPublic: boolean;
}

const CLOSE_ANIMATION_DURATION_MS = 120;

@Component({
  selector: 'app-new-project-dialog',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    TextInputComponent,
    ActionButtonComponent,
    DropdownSelectComponent,
  ],
  templateUrl: './new-project-dialog.component.html',
  styleUrl: './new-project-dialog.component.css',
})
export class NewProjectDialogComponent implements OnDestroy {
  @Input() isSubmitting = false;

  @Output() cancelled = new EventEmitter<void>();
  @Output() submitted = new EventEmitter<NewProjectDialogSubmit>();

  private readonly fb = new FormBuilder();
  private shouldCloseFromBackdropClick = false;
  private closeTimeoutId: ReturnType<typeof setTimeout> | null = null;

  isClosing = false;

  readonly form = this.fb.nonNullable.group({
    name: ['Untitled Project', [Validators.required, Validators.maxLength(120)]],
    isPublic: [false],
  });

  readonly visibilityOptions: DropdownSelectOption[] = [
    { label: 'Private', value: false },
    { label: 'Public', value: true },
  ];

  onCancel(): void {
    if (this.isSubmitting || this.isClosing) {
      return;
    }

    this.isClosing = true;
    this.closeTimeoutId = setTimeout(() => {
      this.closeTimeoutId = null;
      this.cancelled.emit();
    }, CLOSE_ANIMATION_DURATION_MS);
  }

  onBackdropPointerDown(event: PointerEvent): void {
    this.shouldCloseFromBackdropClick = event.target === event.currentTarget;
  }

  onBackdropClick(event: MouseEvent): void {
    const isBackdropClick = event.target === event.currentTarget;
    if (!isBackdropClick || !this.shouldCloseFromBackdropClick) {
      this.shouldCloseFromBackdropClick = false;
      return;
    }

    this.shouldCloseFromBackdropClick = false;
    this.onCancel();
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

  onSubmit(): void {
    if (this.isSubmitting || this.isClosing) {
      return;
    }

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const value = this.form.getRawValue();
    this.submitted.emit({
      name: value.name.trim(),
      isPublic: value.isPublic,
    });
  }
}
