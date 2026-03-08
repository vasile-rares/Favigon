import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output, inject } from '@angular/core';
import { Router } from '@angular/router';

export interface ProjectCardViewModel {
  id: number;
  name: string;
  lastEdited: Date;
  thumbnailUrl?: string;
}

@Component({
  selector: 'app-project-card',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './project-card.component.html',
  styleUrl: './project-card.component.css',
})
export class ProjectCardComponent {
  private readonly router = inject(Router);

  @Input({ required: true }) project!: ProjectCardViewModel;
  @Input() isDeleting = false;
  @Output() deleteRequested = new EventEmitter<ProjectCardViewModel>();

  openProject(): void {
    if (this.isDeleting) {
      return;
    }

    void this.router.navigate(['/project', this.project.id]);
  }

  requestDelete(event: MouseEvent): void {
    event.stopPropagation();
    if (this.isDeleting) {
      return;
    }

    this.deleteRequested.emit(this.project);
  }
}
