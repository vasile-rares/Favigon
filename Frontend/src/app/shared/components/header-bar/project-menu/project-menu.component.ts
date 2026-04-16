import {
  Component,
  DestroyRef,
  ElementRef,
  ViewChild,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ProjectService } from '@app/core';
import { TextInputComponent } from '../../text-input/text-input.component';
import { ToggleGroupComponent, ToggleGroupOption } from '../../toggle-group/toggle-group.component';
import { ActionButtonComponent } from '../../action-button/action-button.component';
import { extractApiErrorMessage } from '../../../../core/utils/api-error.util';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

const PROJECT_MENU_ANIMATION_MS = 120;

@Component({
  selector: 'app-project-menu',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    TextInputComponent,
    ToggleGroupComponent,
    ActionButtonComponent,
  ],
  templateUrl: './project-menu.component.html',
  styleUrl: './project-menu.component.css',
})
export class ProjectMenuComponent {
  private readonly destroyRef = inject(DestroyRef);
  private readonly router = inject(Router);
  private readonly projectService = inject(ProjectService);

  readonly projectId = input.required<number>();
  readonly projectSlug = input.required<string>();
  readonly projectName = input.required<string>();
  readonly projectIsPublic = input.required<boolean>();

  readonly projectRenamed = output<string>();
  readonly visibilityChanged = output<boolean>();
  readonly previewRequested = output<void>();
  readonly closed = output<void>();

  readonly isOpen = signal(false);
  readonly showMenu = signal(false);
  readonly isClosing = signal(false);
  readonly isUpdating = signal(false);
  readonly nameDraft = signal('');
  readonly visibilityDraft = signal(false);
  readonly updateError = signal<string | null>(null);

  readonly visibilityOptions: ToggleGroupOption[] = [
    { label: 'Private', value: false },
    { label: 'Public', value: true },
  ];

  @ViewChild('projectMenuEl') projectMenuEl?: ElementRef<HTMLElement>;
  @ViewChild('projectNameInput') projectNameInput?: TextInputComponent;

  private closeTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    this.destroyRef.onDestroy(() => this.clearCloseTimer());
  }

  toggle(): void {
    if (this.isOpen()) {
      this.close();
    } else {
      this.open();
    }
  }

  open(): void {
    if (this.isUpdating()) return;

    this.clearCloseTimer();
    this.nameDraft.set(this.projectName());
    this.visibilityDraft.set(this.projectIsPublic());
    this.updateError.set(null);
    this.isClosing.set(false);
    this.showMenu.set(true);
    this.isOpen.set(true);

    setTimeout(() => this.projectNameInput?.focus(true));
  }

  close(): void {
    if (this.isUpdating()) return;

    this.nameDraft.set(this.projectName());
    this.visibilityDraft.set(this.projectIsPublic());
    this.updateError.set(null);
    this.isOpen.set(false);

    if (!this.showMenu()) return;

    this.clearCloseTimer();
    this.isClosing.set(true);
    this.closeTimer = setTimeout(() => {
      this.showMenu.set(false);
      this.isClosing.set(false);
      this.closeTimer = null;
      this.closed.emit();
    }, PROJECT_MENU_ANIMATION_MS);
  }

  save(): void {
    if (!this.isOpen() || this.isUpdating()) return;

    const nextName = this.nameDraft().trim();
    const currentName = this.projectName().trim();
    const nextVisibility = this.visibilityDraft();
    const currentVisibility = this.projectIsPublic();

    if (!nextName) {
      this.updateError.set('Project name is required.');
      setTimeout(() => this.projectNameInput?.focus(true));
      return;
    }

    if (nextName === currentName && nextVisibility === currentVisibility) {
      this.close();
      return;
    }

    this.isUpdating.set(true);
    this.updateError.set(null);

    this.projectService
      .update(this.projectId(), { name: nextName, isPublic: nextVisibility })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (project) => {
          this.nameDraft.set(project.name);
          this.visibilityDraft.set(project.isPublic);
          this.updateError.set(null);
          this.isUpdating.set(false);
          this.projectRenamed.emit(project.name);
          this.visibilityChanged.emit(project.isPublic);
          this.close();
        },
        error: (error: unknown) => {
          this.updateError.set(extractApiErrorMessage(error, 'Failed to update project.'));
          this.isUpdating.set(false);
          setTimeout(() => this.projectNameInput?.focus(true));
        },
      });
  }

  openPreview(): void {
    void this.router.navigate(['project', this.projectSlug(), 'preview']);
    this.previewRequested.emit();
  }

  closeIfClickedOutside(target: Node, triggerEl?: HTMLElement): void {
    const menuEl = this.projectMenuEl?.nativeElement;
    if (
      target &&
      !(triggerEl && triggerEl.contains(target)) &&
      !(menuEl && menuEl.contains(target))
    ) {
      this.close();
    }
  }

  private clearCloseTimer(): void {
    if (this.closeTimer) {
      clearTimeout(this.closeTimer);
      this.closeTimer = null;
    }
  }
}
