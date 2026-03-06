import { Component, signal, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { HeaderBarComponent } from '../../../shared/components/header-bar/header-bar.component';
import { ProjectService } from '../../../core/services/project.service';
import { extractApiErrorMessage } from '../../../core/utils/api-error.util';
import { ActionButtonComponent } from '../../../shared/components/button/action-button.component';
import {
  NewProjectDialogComponent,
  NewProjectDialogSubmit,
} from '../components/new-project-dialog/new-project-dialog.component';

interface Project {
  id: number;
  name: string;
  lastEdited: Date;
  thumbnailUrl?: string;
}

@Component({
  selector: 'app-dashboard-page',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    HeaderBarComponent,
    NewProjectDialogComponent,
    ActionButtonComponent,
  ],
  templateUrl: './dashboard-page.component.html',
  styleUrl: './dashboard-page.component.css',
})
export class DashboardPage implements OnInit {
  private readonly router = inject(Router);
  private readonly projectService = inject(ProjectService);

  projects = signal<Project[]>([]);
  isLoading = signal(true);
  errorMessage = signal<string | null>(null);
  isCreateDialogOpen = signal(false);
  isCreatingProject = signal(false);

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

  openCreateProjectDialog() {
    this.errorMessage.set(null);
    this.isCreateDialogOpen.set(true);
  }

  closeCreateProjectDialog() {
    if (this.isCreatingProject()) {
      return;
    }

    this.isCreateDialogOpen.set(false);
  }

  submitCreateProject(payload: NewProjectDialogSubmit) {
    if (this.isCreatingProject()) {
      return;
    }

    this.errorMessage.set(null);
    this.isCreatingProject.set(true);

    this.projectService
      .create({
        name: payload.name,
        isPublic: payload.isPublic,
      })
      .subscribe({
        next: (project) => {
          this.isCreateDialogOpen.set(false);
          this.isCreatingProject.set(false);
          this.router.navigate(['/project', project.projectId]);
        },
        error: (error: unknown) => {
          this.errorMessage.set(extractApiErrorMessage(error, 'Failed to create project.'));
          this.isCreatingProject.set(false);
        },
      });
  }
}
