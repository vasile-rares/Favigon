import { Component, signal, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { HeaderBarComponent } from '../../components/ui/header-bar/header-bar.component';
import { ProjectService } from '../../core/services/project.service';
import { extractApiErrorMessage } from '../../core/utils/api-error.util';

interface Project {
  id: number;
  name: string;
  lastEdited: Date;
  thumbnailUrl?: string;
}

@Component({
  selector: 'app-dashboard-page',
  standalone: true,
  imports: [CommonModule, RouterLink, HeaderBarComponent],
  templateUrl: './dashboard-page.component.html',
  styleUrl: './dashboard-page.component.css',
})
export class DashboardPage implements OnInit {
  private readonly router = inject(Router);
  private readonly projectService = inject(ProjectService);

  projects = signal<Project[]>([]);
  isLoading = signal(true);
  errorMessage = signal<string | null>(null);

  ngOnInit() {
    this.loadProjects();
  }

  private loadProjects() {
    this.isLoading.set(true);
    this.errorMessage.set(null);

    this.projectService.getProjects().subscribe({
      next: (projects) => {
        this.projects.set(
          projects.map((project) => ({
            id: project.projectId,
            name: project.name,
            lastEdited: new Date(project.updatedAt),
          })),
        );
        this.isLoading.set(false);
      },
      error: (error: unknown) => {
        this.errorMessage.set(extractApiErrorMessage(error, 'Failed to load projects.'));
        this.isLoading.set(false);
      },
    });
  }

  createNewProject() {
    this.projectService
      .create({
        name: 'Untitled Project',
        isPublic: false,
      })
      .subscribe({
        next: (project) => {
          this.router.navigate(['/project', project.projectId]);
        },
        error: (error: unknown) => {
          this.errorMessage.set(extractApiErrorMessage(error, 'Failed to create project.'));
        },
      });
  }
}
