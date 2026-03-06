import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
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
export class NewProjectDialogComponent {
  @Input() isSubmitting = false;

  @Output() cancelled = new EventEmitter<void>();
  @Output() submitted = new EventEmitter<NewProjectDialogSubmit>();

  private readonly fb = new FormBuilder();

  readonly form = this.fb.nonNullable.group({
    name: ['Untitled Project', [Validators.required, Validators.maxLength(120)]],
    isPublic: [false],
  });

  readonly visibilityOptions: DropdownSelectOption[] = [
    { label: 'Private', value: false },
    { label: 'Public', value: true },
  ];

  onCancel(): void {
    if (this.isSubmitting) {
      return;
    }

    this.cancelled.emit();
  }

  onSubmit(): void {
    if (this.isSubmitting) {
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
