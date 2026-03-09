import { Component, signal, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { HeaderBarComponent } from '../../../shared/components/header-bar/header-bar.component';
import { ProjectService } from '../../../core/services/project.service';
import { extractApiErrorMessage } from '../../../core/utils/api-error.util';
import { ActionButtonComponent } from '../../../shared/components/button/action-button.component';
import { DIALOG_BOX_IMPORTS } from '../../../shared/components/dialog-box/dialog-box.component';
import { TextInputComponent } from '../../../shared/components/input/text-input.component';
import {
  DropdownSelectComponent,
  DropdownSelectOption,
} from '../../../shared/components/select/dropdown-select.component';
import {
  ProjectCardComponent,
  ProjectCardViewModel,
} from '../components/project-card/project-card.component';

@Component({
  selector: 'app-dashboard-page',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    HeaderBarComponent,
    ...DIALOG_BOX_IMPORTS,
    ActionButtonComponent,
    TextInputComponent,
    DropdownSelectComponent,
    ProjectCardComponent,
  ],
  templateUrl: './dashboard-page.component.html',
  styleUrl: './dashboard-page.component.css',
})
export class DashboardPage implements OnInit {
  private readonly router = inject(Router);
  private readonly projectService = inject(ProjectService);
  private readonly fb = new FormBuilder();

  projects = signal<ProjectCardViewModel[]>([]);
  isLoading = signal(true);
  errorMessage = signal<string | null>(null);
  isCreateDialogOpen = signal(false);
  isCreatingProject = signal(false);
  deletingProjectIds = signal<number[]>([]);

  readonly createProjectFormId = 'dashboard-create-project-form';
  readonly createProjectForm = this.fb.nonNullable.group({
    name: ['Untitled Project', [Validators.required, Validators.maxLength(120)]],
    isPublic: [false],
  });
  readonly visibilityOptions: DropdownSelectOption[] = [
    { label: 'Private', value: false },
    { label: 'Public', value: true },
  ];

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

  isDeletingProject(projectId: number): boolean {
    return this.deletingProjectIds().includes(projectId);
  }

  openCreateProjectDialog() {
    this.errorMessage.set(null);
    this.resetCreateProjectForm();
    this.isCreateDialogOpen.set(true);
  }

  closeCreateProjectDialog() {
    if (this.isCreatingProject()) {
      return;
    }

    this.isCreateDialogOpen.set(false);
  }

  submitCreateProject() {
    if (this.isCreatingProject()) {
      return;
    }

    if (this.createProjectForm.invalid) {
      this.createProjectForm.markAllAsTouched();
      return;
    }

    const payload = this.createProjectForm.getRawValue();

    this.errorMessage.set(null);
    this.isCreatingProject.set(true);

    this.projectService
      .create({
        name: payload.name.trim(),
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

  private resetCreateProjectForm(): void {
    this.createProjectForm.reset({
      name: 'Untitled Project',
      isPublic: false,
    });
  }

  deleteProject(project: ProjectCardViewModel): void {
    if (this.isDeletingProject(project.id)) {
      return;
    }

    const shouldDelete = window.confirm(`Delete project "${project.name}"?`);
    if (!shouldDelete) {
      return;
    }

    this.errorMessage.set(null);
    this.deletingProjectIds.update((projectIds) => [...projectIds, project.id]);

    this.projectService.delete(project.id).subscribe({
      next: () => {
        this.projects.update((projects) => projects.filter((entry) => entry.id !== project.id));
        this.deletingProjectIds.update((projectIds) =>
          projectIds.filter((projectId) => projectId !== project.id),
        );
      },
      error: (error: unknown) => {
        this.errorMessage.set(extractApiErrorMessage(error, 'Failed to delete project.'));
        this.deletingProjectIds.update((projectIds) =>
          projectIds.filter((projectId) => projectId !== project.id),
        );
      },
    });
  }
}
