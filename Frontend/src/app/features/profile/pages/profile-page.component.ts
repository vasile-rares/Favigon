import { DatePipe } from '@angular/common';
import {
  Component,
  DestroyRef,
  ElementRef,
  HostListener,
  Injector,
  NgZone,
  OnInit,
  afterNextRender,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { gsap } from 'gsap';
import { gsapFadeIn, gsapFadeOut } from '../../../shared/utils/gsap-animations.util';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);
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
import type { DropdownSelectOption } from '@app/shared';
import { CreateProjectDialogComponent } from '../../../shared/components/create-project-dialog/create-project-dialog.component';
import { EMPTY, forkJoin, switchMap } from 'rxjs';
import type { ProjectCardViewModel } from '../components/project-card/project-card.component';
import {
  FollowListModalComponent,
  FollowListType,
} from '../components/follow-list-modal/follow-list-modal.component';

type ProjectTypeFilter = 'all' | 'public' | 'private' | 'forked';
type ProjectSortOption = 'updated' | 'created';

@Component({
  selector: 'app-profile-page',
  standalone: true,
  imports: [
    DatePipe,
    FormsModule,
    ReactiveFormsModule,
    FollowListModalComponent,
    CreateProjectDialogComponent,
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
  private readonly injector = inject(Injector);
  private readonly zone = inject(NgZone);
  private readonly el = inject(ElementRef);

  private readonly projectsGridRef = viewChild<ElementRef<HTMLElement>>('projectsGrid');
  private readonly renameCardRef = viewChild<ElementRef<HTMLElement>>('renameCard');
  private readonly deleteCardRef = viewChild<ElementRef<HTMLElement>>('deleteCard');
  private projectsAnimated = false;
  private readonly _animateCards = effect(() => {
    if (this.projects().length > 0 && !this.projectsAnimated) {
      this.projectsAnimated = true;
      afterNextRender(
        () => {
          this.animateProjectCards();
        },
        { injector: this.injector },
      );
    }
  });

  readonly profile = signal<UserProfile | null>(null);
  readonly isOwnProfile = signal(false);
  readonly isFollowing = signal(false);
  readonly followerCount = signal(0);
  readonly followingCount = signal(0);
  readonly isTogglingFollow = signal(false);
  readonly openFollowList = signal<FollowListType | null>(null);
  readonly projects = signal<ProjectCardViewModel[]>([]);
  readonly projectSearchQuery = signal('');
  readonly projectTypeFilter = signal<ProjectTypeFilter>('all');
  readonly projectSortOption = signal<ProjectSortOption>('updated');
  readonly currentPage = signal(1);
  readonly isLoading = signal(true);
  readonly errorMessage = signal<string | null>(null);

  readonly pageSize = signal(this.getPageSize());

  @HostListener('window:resize')
  onResize(): void {
    this.pageSize.set(this.getPageSize());
  }

  private getPageSize(): number {
    return window.innerWidth <= 600 ? 3 : 8;
  }

  readonly isCreateDialogOpen = signal(false);

  readonly busyProjectIds = signal<number[]>([]);
  readonly activeRenameProject = signal<ProjectCardViewModel | null>(null);
  readonly isRenameDialogOpen = signal(false);
  readonly isRenamingProject = signal(false);
  readonly renameProjectError = signal<string | null>(null);

  readonly activeDeleteProject = signal<ProjectCardViewModel | null>(null);
  readonly isDeleteDialogOpen = signal(false);
  readonly isDeleteDialogSubmitting = signal(false);

  readonly openMenuProjectId = signal<number | null>(null);
  readonly closingMenuProjectId = signal<number | null>(null);

  readonly renameProjectFormId = 'profile-rename-project-form';

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
              : typeFilter === 'forked'
                ? !!project.forkedFromProjectId
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
    return visibleCount === totalCount ? `${totalCount}` : `${visibleCount}/${totalCount}`;
  });
  readonly isAnyDialogOpen = computed(
    () => this.isCreateDialogOpen() || this.isRenameDialogOpen() || this.isDeleteDialogOpen(),
  );
  readonly profileBio = computed(() => this.profile()?.bio?.trim() ?? '');

  readonly totalPages = computed(() =>
    Math.max(1, Math.ceil(this.filteredProjects().length / this.pageSize())),
  );
  readonly pagedProjects = computed(() => {
    const page = Math.min(this.currentPage(), this.totalPages());
    const start = (page - 1) * this.pageSize();
    return this.filteredProjects().slice(start, start + this.pageSize());
  });
  readonly visiblePageItems = computed<Array<number | '...'>>((): Array<number | '...'> => {
    const total = this.totalPages();
    const current = this.currentPage();
    if (total <= 3) return Array.from({ length: total }, (_, i) => i + 1);
    const start = Math.max(1, Math.min(current - 1, total - 2));
    const end = Math.min(total, start + 2);
    const items: Array<number | '...'> = [];
    if (start > 1) items.push('...');
    for (let i = start; i <= end; i++) items.push(i);
    if (end < total) items.push('...');
    return items;
  });

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
    this.destroyRef.onDestroy(() => {
      ScrollTrigger.getAll().forEach((t) => t.kill());
    });

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
          this.isFollowing.set(profileUser.isFollowedByCurrentUser ?? false);
          this.followerCount.set(profileUser.followerCount ?? 0);
          this.followingCount.set(profileUser.followingCount ?? 0);
          this.loadProjects(profileUser, ownProfile);
          afterNextRender(
            () => {
              this.animateHero();
              this.initScrollAnimations();
            },
            { injector: this.injector },
          );
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
    this.currentPage.set(1);
  }

  clearProjectSearch(): void {
    this.projectSearchQuery.set('');
    this.currentPage.set(1);
  }

  setProjectType(value: DropdownSelectOption['value'] | null): void {
    if (!this.isProjectTypeFilter(value)) {
      return;
    }

    this.projectTypeFilter.set(value);
    this.currentPage.set(1);
  }

  setProjectSort(value: DropdownSelectOption['value'] | null): void {
    if (!this.isProjectSortOption(value)) {
      return;
    }

    this.projectSortOption.set(value);
    this.currentPage.set(1);
  }

  resetProjectToolbar(): void {
    this.projectSearchQuery.set('');
    this.projectTypeFilter.set('all');
    this.projectSortOption.set('updated');
    this.currentPage.set(1);
  }

  goToPage(page: number): void {
    const clamped = Math.max(1, Math.min(page, this.totalPages()));
    this.currentPage.set(clamped);
  }

  openCardMenu(projectId: number, event: MouseEvent): void {
    event.stopPropagation();
    const current = this.openMenuProjectId();
    if (current === projectId) {
      this.animateMenuClose();
      return;
    }
    if (current !== null) {
      this.openMenuProjectId.set(null);
      this.closingMenuProjectId.set(null);
    }
    this.openMenuProjectId.set(projectId);
    afterNextRender(() => this.animateMenuOpen(), { injector: this.injector });
  }

  closeCardMenu(): void {
    if (this.openMenuProjectId() !== null) {
      this.animateMenuClose();
    }
  }

  @HostListener('document:click')
  onDocumentClick(): void {
    if (this.openMenuProjectId() !== null) {
      this.animateMenuClose();
    }
  }

  isProjectBusy(projectId: number): boolean {
    return this.busyProjectIds().includes(projectId);
  }

  navigateToProject(project: ProjectCardViewModel): void {
    if (this.isProjectBusy(project.id)) return;
    const commands = this.isOwnProfile()
      ? ['/project', project.slug]
      : ['/project', project.slug, 'preview'];
    void this.router.navigate(commands);
  }

  goToSettings(): void {
    void this.router.navigate(['/settings']);
  }

  toggleFollow(): void {
    const profileData = this.profile();
    if (!profileData || this.isTogglingFollow()) return;

    this.isTogglingFollow.set(true);
    const wasFollowing = this.isFollowing();
    // Optimistic update
    this.isFollowing.set(!wasFollowing);
    this.followerCount.update((c) => (wasFollowing ? c - 1 : c + 1));

    const request$ = wasFollowing
      ? this.userService.unfollowUser(profileData.username)
      : this.userService.followUser(profileData.username);

    request$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => this.isTogglingFollow.set(false),
      error: () => {
        // Rollback on error
        this.isFollowing.set(wasFollowing);
        this.followerCount.update((c) => (wasFollowing ? c + 1 : c - 1));
        this.isTogglingFollow.set(false);
      },
    });
  }

  toggleProjectStar(project: ProjectCardViewModel): void {
    const wasStarred = project.isStarredByCurrentUser;

    // Optimistic update
    this.projects.update((list) =>
      list.map((p) =>
        p.id === project.id
          ? {
              ...p,
              isStarredByCurrentUser: !wasStarred,
              starCount: wasStarred ? p.starCount - 1 : p.starCount + 1,
            }
          : p,
      ),
    );

    const request$ = wasStarred
      ? this.projectService.unstarProject(project.id)
      : this.projectService.starProject(project.id);

    request$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      error: () => {
        // Rollback on error
        this.projects.update((list) =>
          list.map((p) =>
            p.id === project.id
              ? {
                  ...p,
                  isStarredByCurrentUser: wasStarred,
                  starCount: wasStarred ? p.starCount + 1 : p.starCount - 1,
                }
              : p,
          ),
        );
      },
    });
  }

  toggleProjectLike(project: ProjectCardViewModel): void {
    const wasLiked = project.isLikedByCurrentUser;

    // Optimistic update
    this.projects.update((list) =>
      list.map((p) =>
        p.id === project.id
          ? {
              ...p,
              isLikedByCurrentUser: !wasLiked,
              likeCount: wasLiked ? p.likeCount - 1 : p.likeCount + 1,
            }
          : p,
      ),
    );

    const request$ = wasLiked
      ? this.projectService.unlikeProject(project.id)
      : this.projectService.likeProject(project.id);

    request$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      error: () => {
        // Rollback on error
        this.projects.update((list) =>
          list.map((p) =>
            p.id === project.id
              ? {
                  ...p,
                  isLikedByCurrentUser: wasLiked,
                  likeCount: wasLiked ? p.likeCount + 1 : p.likeCount - 1,
                }
              : p,
          ),
        );
      },
    });
  }

  openCreateProjectDialog(): void {
    this.errorMessage.set(null);
    this.isCreateDialogOpen.set(true);
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
    afterNextRender(
      () => {
        const card = this.renameCardRef()?.nativeElement;
        if (!card) return;
        gsapFadeIn(this.zone, card);
      },
      { injector: this.injector },
    );
  }

  closeRenameProjectDialog(): void {
    if (this.isRenamingProject()) {
      return;
    }

    const card = this.renameCardRef()?.nativeElement;
    if (!card) {
      this.isRenameDialogOpen.set(false);
      this.activeRenameProject.set(null);
      this.renameProjectError.set(null);
      return;
    }

    gsapFadeOut(this.zone, card, () => {
      this.isRenameDialogOpen.set(false);
      this.activeRenameProject.set(null);
      this.renameProjectError.set(null);
    });
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
    afterNextRender(
      () => {
        const card = this.deleteCardRef()?.nativeElement;
        if (!card) return;
        gsapFadeIn(this.zone, card);
      },
      { injector: this.injector },
    );
  }

  closeDeleteProjectDialog(): void {
    if (this.isDeleteDialogSubmitting()) {
      return;
    }

    const card = this.deleteCardRef()?.nativeElement;
    if (!card) {
      this.isDeleteDialogOpen.set(false);
      this.activeDeleteProject.set(null);
      return;
    }

    gsapFadeOut(this.zone, card, () => {
      this.isDeleteDialogOpen.set(false);
      this.activeDeleteProject.set(null);
    });
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
      starCount: project.starCount ?? 0,
      viewCount: project.viewCount ?? 0,
      isStarredByCurrentUser: project.isStarredByCurrentUser ?? false,
      likeCount: project.likeCount ?? 0,
      isLikedByCurrentUser: project.isLikedByCurrentUser ?? false,
      forkedFromProjectId: project.forkedFromProjectId ?? null,
      forkedFromOwnerUsername: project.forkedFromOwnerUsername ?? null,
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
    return value === 'all' || value === 'public' || value === 'private' || value === 'forked';
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
    this.busyProjectIds.set([]);
    this.isFollowing.set(false);
    this.followerCount.set(0);
    this.followingCount.set(0);
    this.isTogglingFollow.set(false);
    this.openFollowList.set(null);
    this.activeRenameProject.set(null);
    this.isRenameDialogOpen.set(false);
    this.isRenamingProject.set(false);
    this.renameProjectError.set(null);
    this.activeDeleteProject.set(null);
    this.isDeleteDialogOpen.set(false);
    this.isDeleteDialogSubmitting.set(false);
    this.openMenuProjectId.set(null);
    this.closingMenuProjectId.set(null);
    this.projectsAnimated = false;
    ScrollTrigger.getAll().forEach((t) => t.kill());
  }

  private animateMenuOpen(): void {
    const host = this.el.nativeElement as HTMLElement;
    const menu = host.querySelector<HTMLElement>('.prj-card-menu');
    if (!menu) return;
    this.zone.runOutsideAngular(() => {
      gsap.fromTo(
        menu,
        { opacity: 0, scale: 0.88, y: 8, transformOrigin: 'bottom right' },
        { opacity: 1, scale: 1, y: 0, duration: 0.22, ease: 'back.out(1.7)' },
      );
    });
  }

  private animateMenuClose(): void {
    const id = this.openMenuProjectId();
    if (id === null || this.closingMenuProjectId() !== null) return;
    const host = this.el.nativeElement as HTMLElement;
    const menu = host.querySelector<HTMLElement>('.prj-card-menu');
    this.closingMenuProjectId.set(id);
    this.openMenuProjectId.set(null);
    if (!menu) {
      this.closingMenuProjectId.set(null);
      return;
    }
    this.zone.runOutsideAngular(() => {
      gsap.to(menu, {
        opacity: 0,
        scale: 0.88,
        y: 8,
        duration: 0.15,
        ease: 'power2.in',
        transformOrigin: 'bottom right',
        onComplete: () => {
          this.zone.run(() => this.closingMenuProjectId.set(null));
        },
      });
    });
  }

  private animateHero(): void {
    this.zone.runOutsideAngular(() => {
      const host = this.el.nativeElement as HTMLElement;
      const ava = host.querySelector<HTMLElement>('.prf-ava');
      const name = host.querySelector<HTMLElement>('.prf-name');
      const handle = host.querySelector<HTMLElement>('.prf-handle');
      const stats = host.querySelectorAll<HTMLElement>('.prf-stat');
      const foot = host.querySelector<HTMLElement>('.prf-cover-foot');
      const bio = host.querySelector<HTMLElement>('.prf-bio');

      const tl = gsap.timeline({ defaults: { ease: 'power3.out' } });

      if (ava) {
        gsap.set(ava, { opacity: 0, scale: 0.82, filter: 'blur(12px)' });
        tl.to(ava, { opacity: 1, scale: 1, filter: 'blur(0px)', duration: 0.8 }, 0);
      }

      if (name) {
        gsap.set(name, { opacity: 0, y: 18, filter: 'blur(8px)' });
        tl.to(name, { opacity: 1, y: 0, filter: 'blur(0px)', duration: 0.7 }, 0.18);
      }

      if (handle) {
        gsap.set(handle, { opacity: 0, y: 12, filter: 'blur(6px)' });
        tl.to(handle, { opacity: 1, y: 0, filter: 'blur(0px)', duration: 0.6 }, 0.28);
      }

      if (stats.length) {
        gsap.set(stats, { opacity: 0, y: 10 });
        tl.to(stats, { opacity: 1, y: 0, duration: 0.55, stagger: 0.07 }, 0.38);
      }

      if (foot) {
        gsap.set(foot, { opacity: 0, y: 10 });
        tl.to(foot, { opacity: 1, y: 0, duration: 0.5 }, 0.52);
      }

      if (bio) {
        gsap.set(bio, { opacity: 0, y: 8 });
        tl.to(bio, { opacity: 1, y: 0, duration: 0.5 }, 0.6);
      }
    });
  }

  private animateProjectCards(): void {
    this.zone.runOutsideAngular(() => {
      const grid = this.projectsGridRef()?.nativeElement;
      if (!grid) return;
      const cards = grid.querySelectorAll<HTMLElement>('.prj-card');
      if (!cards.length) return;

      gsap.set(cards, { opacity: 0, y: 22, filter: 'blur(8px)' });
      gsap.to(cards, {
        opacity: 1,
        y: 0,
        filter: 'blur(0px)',
        duration: 0.6,
        stagger: 0.07,
        ease: 'power3.out',
        scrollTrigger: {
          trigger: grid,
          start: 'top 92%',
          toggleActions: 'play none none none',
        },
      });
      requestAnimationFrame(() => ScrollTrigger.refresh());
    });
  }

  private initScrollAnimations(): void {
    this.zone.runOutsideAngular(() => {
      const host = this.el.nativeElement as HTMLElement;
      const toolbarHead = host.querySelector<HTMLElement>('.prf-toolbar-head');
      const toolbarControls = host.querySelector<HTMLElement>('.prf-toolbar-controls');

      const stConfig = {
        start: 'top 92%',
        toggleActions: 'play none none none' as const,
      };

      if (toolbarHead) {
        gsap.set(toolbarHead, { opacity: 0, y: 18, filter: 'blur(10px)' });
        gsap.to(toolbarHead, {
          opacity: 1,
          y: 0,
          filter: 'blur(0px)',
          duration: 0.7,
          ease: 'power3.out',
          scrollTrigger: { trigger: toolbarHead, ...stConfig },
        });
      }

      if (toolbarControls) {
        gsap.set(toolbarControls, { opacity: 0, y: 12, filter: 'blur(8px)' });
        gsap.to(toolbarControls, {
          opacity: 1,
          y: 0,
          filter: 'blur(0px)',
          duration: 0.6,
          ease: 'power3.out',
          scrollTrigger: { trigger: toolbarControls, ...stConfig },
        });
      }

      requestAnimationFrame(() => ScrollTrigger.refresh());
    });
  }
}
