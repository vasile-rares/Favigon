import { CommonModule } from '@angular/common';
import {
  Component,
  ElementRef,
  EventEmitter,
  HostListener,
  Input,
  Output,
  inject,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';

export interface ProjectCardViewModel {
  id: number;
  slug: string;
  name: string;
  isPublic: boolean;
  createdAt: Date;
  lastEdited: Date;
  thumbnailDataUrl?: string | null;
}

@Component({
  selector: 'app-project-card',
  standalone: true,
  imports: [CommonModule],
  host: {
    '[class.project-card-host--menu-active]': 'isMenuOpen() || isMenuClosing()',
  },
  templateUrl: './project-card.component.html',
  styleUrl: './project-card.component.css',
})
export class ProjectCardComponent {
  private readonly router = inject(Router);
  private readonly elementRef = inject(ElementRef<HTMLElement>);
  private readonly menuAnimationMs = 120;
  private closeMenuTimeoutId: ReturnType<typeof setTimeout> | null = null;

  readonly isMenuOpen = signal(false);
  readonly isMenuClosing = signal(false);

  @Input({ required: true }) project!: ProjectCardViewModel;
  @Input() isBusy = false;
  @Input() isOwner = false;
  @Input() openMode: 'editor' | 'preview' = 'editor';

  @Output() renameRequested = new EventEmitter<ProjectCardViewModel>();
  @Output() deleteRequested = new EventEmitter<ProjectCardViewModel>();
  @Output() visibilityToggleRequested = new EventEmitter<ProjectCardViewModel>();

  get openLabel(): string {
    if (this.isBusy) {
      return 'Working...';
    }

    return this.openMode === 'editor' ? 'Open editor' : 'Open preview';
  }

  get visibilityActionLabel(): string {
    return this.project.isPublic ? 'Make Private' : 'Make Public';
  }

  openProject(): void {
    if (this.isBusy) {
      return;
    }

    const commands =
      this.openMode === 'editor'
        ? ['/project', this.project.slug]
        : ['/project', this.project.slug, 'preview'];
    void this.router.navigate(commands);
  }

  toggleMenu(event: MouseEvent): void {
    event.stopPropagation();

    if (!this.isOwner || this.isBusy) {
      return;
    }

    if (this.isMenuOpen()) {
      this.closeMenu();
      return;
    }

    this.clearPendingMenuClose();
    this.isMenuClosing.set(false);
    this.isMenuOpen.set(true);
  }

  requestRename(event: MouseEvent): void {
    event.stopPropagation();
    this.closeMenu();

    if (this.isBusy) {
      return;
    }

    this.renameRequested.emit(this.project);
  }

  requestVisibilityToggle(event: MouseEvent): void {
    event.stopPropagation();
    this.closeMenu();

    if (this.isBusy) {
      return;
    }

    this.visibilityToggleRequested.emit(this.project);
  }

  requestDelete(event: MouseEvent): void {
    event.stopPropagation();
    this.closeMenu();

    if (this.isBusy) {
      return;
    }

    this.deleteRequested.emit(this.project);
  }

  @HostListener('document:click', ['$event'])
  handleDocumentClick(event: MouseEvent): void {
    if (!this.isMenuOpen()) {
      return;
    }

    const target = event.target as Node | null;
    if (target && !this.elementRef.nativeElement.contains(target)) {
      this.closeMenu();
    }
  }

  @HostListener('document:keydown.escape')
  handleEscapeKey(): void {
    this.closeMenu();
  }

  private closeMenu(): void {
    if (!this.isMenuOpen()) {
      return;
    }

    this.clearPendingMenuClose();
    this.isMenuClosing.set(true);

    this.closeMenuTimeoutId = setTimeout(() => {
      this.isMenuOpen.set(false);
      this.isMenuClosing.set(false);
      this.closeMenuTimeoutId = null;
    }, this.menuAnimationMs);
  }

  private clearPendingMenuClose(): void {
    if (!this.closeMenuTimeoutId) {
      return;
    }

    clearTimeout(this.closeMenuTimeoutId);
    this.closeMenuTimeoutId = null;
  }
}
