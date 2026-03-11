import { Component, signal, inject, OnInit, DestroyRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { forkJoin, switchMap } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { HeaderBarComponent } from '../../../shared/components/header-bar/header-bar.component';
import { ProjectService } from '../../../core/services/project.service';
import { UserService } from '../../../core/services/user.service';
import { UserProfile } from '../../../core/models/user.models';
import { extractApiErrorMessage } from '../../../core/utils/api-error.util';
import { ActionButtonComponent } from '../../../shared/components/action-button/action-button.component';
import { DIALOG_BOX_IMPORTS } from '../../../shared/components/dialog-box/dialog-box.component';
import { TextInputComponent } from '../../../shared/components/text-input/text-input.component';
import {
  DropdownSelectComponent,
  DropdownSelectOption,
} from '../../../shared/components/dropdown-select/dropdown-select.component';
import {
  ProjectCardComponent,
  ProjectCardViewModel,
} from '../components/project-card/project-card.component';

@Component({
  selector: 'app-profile-page',
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
  templateUrl: './profile-page.component.html',
  styleUrl: './profile-page.component.css',
})
export class ProfilePage implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly projectService = inject(ProjectService);
  private readonly userService = inject(UserService);
  private readonly fb = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);

  profile = signal<UserProfile | null>(null);
  isOwnProfile = signal(false);
  projects = signal<ProjectCardViewModel[]>([]);
  isLoading = signal(true);
  errorMessage = signal<string | null>(null);
  isCreateDialogOpen = signal(false);
  isCreatingProject = signal(false);
  deletingProjectIds = signal<number[]>([]);

  readonly createProjectFormId = 'profile-create-project-form';
  readonly createProjectForm = this.fb.nonNullable.group({
    name: ['Untitled Project', [Validators.required, Validators.maxLength(120)]],
    isPublic: [false],
  });
  readonly visibilityOptions: DropdownSelectOption[] = [
    { label: 'Private', value: false },
    { label: 'Public', value: true },
  ];

  get fallbackAvatarUrl(): string {
    return 'https://github.com/shadcn.png';
  }

  get avatarUrl(): string {
    return this.profile()?.profilePictureUrl?.trim() || this.fallbackAvatarUrl;
  }

  ngOnInit() {
    this.route.paramMap
      .pipe(
        switchMap((params) => {
          const username = params.get('username');
          if (!username) {
            void this.router.navigate(['/']);
            return [];
          }
          this.isLoading.set(true);
          this.profile.set(null);
          this.projects.set([]);
          this.errorMessage.set(null);
          return forkJoin({
            profileUser: this.userService.getByUsername(username),
            currentUser: this.userService.getMe(),
          });
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: ({ profileUser, currentUser }) => {
          this.profile.set(profileUser);
          const own = currentUser.username === profileUser.username;
          this.isOwnProfile.set(own);
          this.loadProjects(profileUser, own);
        },
        error: () => {
          this.errorMessage.set('Profile not found.');
          this.isLoading.set(false);
        },
      });
  }

  private loadProjects(profileUser: UserProfile, isOwn: boolean) {
    this.isLoading.set(true);
    this.errorMessage.set(null);

    const source$ = isOwn
      ? this.projectService.getProjects()
      : this.projectService.getByUserId(profileUser.userId, true);

    source$.subscribe({
      next: (projects) => {
        this.projects.set(
          projects.map((p) => ({
            id: p.projectId,
            name: p.name,
            lastEdited: new Date(p.updatedAt),
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
    this.createProjectForm.reset({ name: 'Untitled Project', isPublic: false });
    this.isCreateDialogOpen.set(true);
  }

  closeCreateProjectDialog() {
    if (this.isCreatingProject()) return;
    this.isCreateDialogOpen.set(false);
  }

  submitCreateProject() {
    if (this.createProjectForm.invalid || this.isCreatingProject()) return;

    this.isCreatingProject.set(true);
    const { name, isPublic } = this.createProjectForm.getRawValue();

    this.projectService.create({ name, isPublic }).subscribe({
      next: (project) => {
        this.isCreatingProject.set(false);
        this.isCreateDialogOpen.set(false);
        void this.router.navigate(['/project', project.projectId]);
      },
      error: (error: unknown) => {
        this.errorMessage.set(extractApiErrorMessage(error, 'Failed to create project.'));
        this.isCreatingProject.set(false);
      },
    });
  }

  deleteProject(project: ProjectCardViewModel) {
    this.deletingProjectIds.update((ids) => [...ids, project.id]);

    this.projectService.delete(project.id).subscribe({
      next: () => {
        this.projects.update((list) => list.filter((p) => p.id !== project.id));
        this.deletingProjectIds.update((ids) => ids.filter((id) => id !== project.id));
      },
      error: () => {
        this.deletingProjectIds.update((ids) => ids.filter((id) => id !== project.id));
      },
    });
  }
}
