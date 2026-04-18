import { CommonModule } from '@angular/common';
import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import {
  CurrentUserService,
  ProjectResponse,
  ProjectService,
  UserService,
  extractApiErrorMessage,
  FALLBACK_AVATAR_URL,
} from '@app/core';
import type { UserProfile } from '@app/core';
import {
  ActionButtonComponent,
  DIALOG_BOX_IMPORTS,
  DropdownSelectComponent,
  HeaderBarComponent,
  TextInputComponent,
} from '@app/shared';
import type { DropdownSelectOption } from '@app/shared';
import { EMPTY, forkJoin, switchMap } from 'rxjs';
import {
  ProjectCardComponent,
  ProjectCardViewModel,
} from '../components/project-card/project-card.component';

type ProjectTypeFilter = 'all' | 'public' | 'private' | 'forks';
type ProjectSortOption = 'updated' | 'created';

@Component({
  selector: 'app-profile-page',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    HeaderBarComponent,
    ...DIALOG_BOX_IMPORTS,
    ActionButtonComponent,
    TextInputComponent,
    DropdownSelectComponent,
    ProjectCardComponent,
  ],
  templateUrl: './profile-page.component.html',
  styleUrl: './profile-page.component.css',
})
export class ProfilePage implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly projectService = inject(ProjectService);
  private readonly userService = inject(UserService);
  private readonly currentUser = inject(CurrentUserService);
  private readonly fb = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);

  readonly profile = signal<UserProfile | null>(null);
  readonly isOwnProfile = signal(false);
  readonly projects = signal<ProjectCardViewModel[]>([]);
  readonly projectSearchQuery = signal('');
  readonly projectTypeFilter = signal<ProjectTypeFilter>('all');
  readonly projectSortOption = signal<ProjectSortOption>('updated');
  readonly isLoading = signal(true);
  readonly errorMessage = signal<string | null>(null);

  readonly isCreateDialogOpen = signal(false);
  readonly isCreatingProject = signal(false);

  readonly busyProjectIds = signal<number[]>([]);
  readonly activeRenameProject = signal<ProjectCardViewModel | null>(null);
  readonly isRenameDialogOpen = signal(false);
  readonly isRenamingProject = signal(false);
  readonly renameProjectError = signal<string | null>(null);

  readonly activeDeleteProject = signal<ProjectCardViewModel | null>(null);
  readonly isDeleteDialogOpen = signal(false);
  readonly isDeleteDialogSubmitting = signal(false);

  readonly createProjectFormId = 'profile-create-project-form';
  readonly renameProjectFormId = 'profile-rename-project-form';

  readonly createProjectForm = this.fb.nonNullable.group({
    name: ['Untitled Project', [Validators.required, Validators.maxLength(120)]],
    isPublic: [false],
  });

  readonly renameProjectForm = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(120)]],
  });

  readonly visibilityOptions: DropdownSelectOption[] = [
    { label: 'Private', value: false },
    { label: 'Public', value: true },
  ];

  readonly projectTypeOptions = computed<DropdownSelectOption[]>(() => [
    { label: 'All', triggerLabel: 'All', value: 'all' },
    { label: 'Public', triggerLabel: 'Public', value: 'public' },
    {
      label: this.isOwnProfile() ? 'Private' : 'Private (Owner only)',
      triggerLabel: 'Private',
      value: 'private',
      disabled: !this.isOwnProfile(),
    },
    {
      label: 'Forks (Soon)',
      triggerLabel: 'Forks',
      value: 'forks',
      disabled: true,
    },
  ]);

  readonly projectSortOptions: DropdownSelectOption[] = [
    { label: 'Date Updated', triggerLabel: 'Updated', value: 'updated' },
    { label: 'Date Created', triggerLabel: 'Created', value: 'created' },
  ];

  readonly projectCount = computed(() => this.projects().length);
  readonly publicProjectCount = computed(
    () => this.projects().filter((project) => project.isPublic).length,
  );
  readonly privateProjectCount = computed(
    () => this.projects().filter((project) => !project.isPublic).length,
  );
  readonly filteredProjects = computed(() => {
    const query = this.projectSearchQuery().trim().toLowerCase();
    const typeFilter = this.projectTypeFilter();
    const filteredProjects = this.projects().filter((project) => {
      const matchesSearch = !query || project.name.toLowerCase().includes(query);
      const matchesType =
        typeFilter === 'all'
          ? true
          : typeFilter === 'public'
            ? project.isPublic
            : typeFilter === 'private'
              ? !project.isPublic
              : false;

      return matchesSearch && matchesType;
    });

    return this.sortProjects(filteredProjects, this.projectSortOption());
  });
  readonly visibleProjectCount = computed(() => this.filteredProjects().length);
  readonly hasActiveProjectFilters = computed(
    () => this.projectSearchQuery().trim().length > 0 || this.projectTypeFilter() !== 'all',
  );
  readonly projectResultsLabel = computed(() => {
    const visibleCount = this.visibleProjectCount();
    const totalCount = this.projectCount();

    if (visibleCount === totalCount) {
      return this.formatProjectCount(totalCount);
    }

    return `${visibleCount} of ${totalCount} projects`;
  });
  readonly isAnyDialogOpen = computed(
    () => this.isCreateDialogOpen() || this.isRenameDialogOpen() || this.isDeleteDialogOpen(),
  );
  readonly profileBio = computed(() => this.profile()?.bio?.trim() ?? '');

  get fallbackAvatarUrl(): string {
    return FALLBACK_AVATAR_URL;
  }

  get avatarUrl(): string {
    return this.profile()?.profilePictureUrl?.trim() || this.fallbackAvatarUrl;
  }

  get renameProjectNameError(): string {
    return this.renameProjectError() || 'Project name is required.';
  }

  ngOnInit(): void {
    this.route.paramMap
      .pipe(
        switchMap((params) => {
          const username = params.get('username');
          if (!username) {
            void this.router.navigate(['/']);
            return EMPTY;
          }

          this.resetProfilePageState();

          return forkJoin({
            profileUser: this.userService.getByUsername(username),
            currentUser: this.currentUser.load(),
          });
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: ({ profileUser, currentUser }) => {
          this.profile.set(profileUser);
          const ownProfile = currentUser !== null && currentUser.username === profileUser.username;
          this.isOwnProfile.set(ownProfile);
          this.loadProjects(profileUser, ownProfile);
        },
        error: () => {
          this.errorMessage.set('Profile not found.');
          this.isLoading.set(false);
        },
      });
  }

  formatProjectCount(count: number): string {
    return `${count} project${count === 1 ? '' : 's'}`;
  }

  updateProjectSearchQuery(event: Event): void {
    this.projectSearchQuery.set((event.target as HTMLInputElement).value);
  }

  clearProjectSearch(): void {
    this.projectSearchQuery.set('');
  }

  setProjectType(value: DropdownSelectOption['value'] | null): void {
    if (!this.isProjectTypeFilter(value)) {
      return;
    }

    this.projectTypeFilter.set(value);
  }

  setProjectSort(value: DropdownSelectOption['value'] | null): void {
    if (!this.isProjectSortOption(value)) {
      return;
    }

    this.projectSortOption.set(value);
  }

  resetProjectToolbar(): void {
    this.projectSearchQuery.set('');
    this.projectTypeFilter.set('all');
    this.projectSortOption.set('updated');
  }

  isProjectBusy(projectId: number): boolean {
    return this.busyProjectIds().includes(projectId);
  }

  goToSettings(): void {
    void this.router.navigate(['/settings']);
  }

  openCreateProjectDialog(): void {
    this.errorMessage.set(null);
    this.createProjectForm.reset({ name: 'Untitled Project', isPublic: false });
    this.isCreateDialogOpen.set(true);
  }

  closeCreateProjectDialog(): void {
    if (this.isCreatingProject()) {
      return;
    }

    this.isCreateDialogOpen.set(false);
  }

  submitCreateProject(): void {
    if (this.createProjectForm.invalid || this.isCreatingProject()) {
      this.createProjectForm.markAllAsTouched();
      return;
    }

    this.isCreatingProject.set(true);
    this.errorMessage.set(null);

    const { name, isPublic } = this.createProjectForm.getRawValue();
    this.projectService
      .create({ name: name.trim(), isPublic })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (project) => {
          this.isCreatingProject.set(false);
          this.isCreateDialogOpen.set(false);
          void this.router.navigate(['/project', project.slug]);
        },
        error: (error: unknown) => {
          this.errorMessage.set(extractApiErrorMessage(error, 'Failed to create project.'));
          this.isCreatingProject.set(false);
        },
      });
  }

  openRenameProjectDialog(project: ProjectCardViewModel): void {
    if (!this.isOwnProfile() || this.isProjectBusy(project.id)) {
      return;
    }

    this.errorMessage.set(null);
    this.activeRenameProject.set(project);
    this.renameProjectForm.reset({ name: project.name });
    this.renameProjectError.set(null);
    this.isRenameDialogOpen.set(true);
  }

  closeRenameProjectDialog(): void {
    if (this.isRenamingProject()) {
      return;
    }

    this.isRenameDialogOpen.set(false);
    this.activeRenameProject.set(null);
    this.renameProjectError.set(null);
  }

  submitRenameProject(): void {
    const project = this.activeRenameProject();
    if (!project || this.isRenamingProject()) {
      return;
    }

    if (this.renameProjectForm.invalid) {
      this.renameProjectForm.markAllAsTouched();
      return;
    }

    const nextName = this.renameProjectForm.getRawValue().name.trim();
    if (!nextName) {
      this.renameProjectForm.markAllAsTouched();
      return;
    }

    if (nextName === project.name) {
      this.closeRenameProjectDialog();
      return;
    }

    this.renameProjectError.set(null);
    this.errorMessage.set(null);
    this.isRenamingProject.set(true);
    this.setProjectBusy(project.id, true);

    this.projectService
      .update(project.id, { name: nextName, isPublic: project.isPublic })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (updatedProject) => {
          this.replaceProject(this.mapProjectToCard(updatedProject));
          this.isRenamingProject.set(false);
          this.setProjectBusy(project.id, false);
          this.closeRenameProjectDialog();
        },
        error: (error: unknown) => {
          this.renameProjectError.set(extractApiErrorMessage(error, 'Failed to rename project.'));
          this.isRenamingProject.set(false);
          this.setProjectBusy(project.id, false);
        },
      });
  }

  openDeleteProjectDialog(project: ProjectCardViewModel): void {
    if (!this.isOwnProfile() || this.isProjectBusy(project.id)) {
      return;
    }

    this.errorMessage.set(null);
    this.activeDeleteProject.set(project);
    this.isDeleteDialogOpen.set(true);
  }

  closeDeleteProjectDialog(): void {
    if (this.isDeleteDialogSubmitting()) {
      return;
    }

    this.isDeleteDialogOpen.set(false);
    this.activeDeleteProject.set(null);
  }

  confirmDeleteProject(): void {
    const project = this.activeDeleteProject();
    if (!project || this.isDeleteDialogSubmitting()) {
      return;
    }

    this.errorMessage.set(null);
    this.isDeleteDialogSubmitting.set(true);
    this.setProjectBusy(project.id, true);

    this.projectService
      .delete(project.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.projects.update((list) => list.filter((entry) => entry.id !== project.id));
          this.isDeleteDialogSubmitting.set(false);
          this.setProjectBusy(project.id, false);
          this.closeDeleteProjectDialog();
        },
        error: (error: unknown) => {
          this.errorMessage.set(extractApiErrorMessage(error, 'Failed to delete project.'));
          this.isDeleteDialogSubmitting.set(false);
          this.setProjectBusy(project.id, false);
          this.closeDeleteProjectDialog();
        },
      });
  }

  toggleProjectVisibility(project: ProjectCardViewModel): void {
    if (!this.isOwnProfile() || this.isProjectBusy(project.id)) {
      return;
    }

    this.errorMessage.set(null);
    this.setProjectBusy(project.id, true);

    this.projectService
      .update(project.id, { name: project.name, isPublic: !project.isPublic })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (updatedProject) => {
          this.replaceProject(this.mapProjectToCard(updatedProject));
          this.setProjectBusy(project.id, false);
        },
        error: (error: unknown) => {
          this.errorMessage.set(
            extractApiErrorMessage(error, 'Failed to update project visibility.'),
          );
          this.setProjectBusy(project.id, false);
        },
      });
  }

  private loadProjects(profileUser: UserProfile, isOwnProfile: boolean): void {
    this.isLoading.set(true);
    this.errorMessage.set(null);

    const source$ = isOwnProfile
      ? this.projectService.getProjects()
      : this.projectService.getByUserId(profileUser.userId, true);

    source$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (projects) => {
        this.projects.set(projects.map((project) => this.mapProjectToCard(project)));
        this.isLoading.set(false);
      },
      error: (error: unknown) => {
        this.errorMessage.set(extractApiErrorMessage(error, 'Failed to load projects.'));
        this.isLoading.set(false);
      },
    });
  }

  private mapProjectToCard(project: ProjectResponse): ProjectCardViewModel {
    return {
      id: project.projectId,
      slug: project.slug,
      name: project.name,
      isPublic: project.isPublic,
      createdAt: new Date(project.createdAt),
      lastEdited: new Date(project.updatedAt),
      thumbnailDataUrl: project.thumbnailDataUrl ?? null,
    };
  }

  private replaceProject(project: ProjectCardViewModel): void {
    this.projects.update((list) =>
      list.map((entry) => (entry.id === project.id ? project : entry)),
    );

    if (this.activeRenameProject()?.id === project.id) {
      this.activeRenameProject.set(project);
    }

    if (this.activeDeleteProject()?.id === project.id) {
      this.activeDeleteProject.set(project);
    }
  }

  private sortProjects(
    projects: ProjectCardViewModel[],
    sortOption: ProjectSortOption,
  ): ProjectCardViewModel[] {
    const sortedProjects = [...projects];

    if (sortOption === 'created') {
      return sortedProjects.sort(
        (left, right) => right.createdAt.getTime() - left.createdAt.getTime(),
      );
    }

    return sortedProjects.sort(
      (left, right) => right.lastEdited.getTime() - left.lastEdited.getTime(),
    );
  }

  private isProjectTypeFilter(
    value: DropdownSelectOption['value'] | null,
  ): value is ProjectTypeFilter {
    return value === 'all' || value === 'public' || value === 'private' || value === 'forks';
  }

  private isProjectSortOption(
    value: DropdownSelectOption['value'] | null,
  ): value is ProjectSortOption {
    return value === 'updated' || value === 'created';
  }

  private setProjectBusy(projectId: number, busy: boolean): void {
    this.busyProjectIds.update((ids) => {
      if (busy) {
        return ids.includes(projectId) ? ids : [...ids, projectId];
      }

      return ids.filter((id) => id !== projectId);
    });
  }

  private resetProfilePageState(): void {
    this.profile.set(null);
    this.projects.set([]);
    this.projectSearchQuery.set('');
    this.projectTypeFilter.set('all');
    this.projectSortOption.set('updated');
    this.isLoading.set(true);
    this.errorMessage.set(null);
    this.isCreateDialogOpen.set(false);
    this.isCreatingProject.set(false);
    this.busyProjectIds.set([]);
    this.activeRenameProject.set(null);
    this.isRenameDialogOpen.set(false);
    this.isRenamingProject.set(false);
    this.renameProjectError.set(null);
    this.activeDeleteProject.set(null);
    this.isDeleteDialogOpen.set(false);
    this.isDeleteDialogSubmitting.set(false);
  }
}
