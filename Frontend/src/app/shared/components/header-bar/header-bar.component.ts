import {
  Component,
  DestroyRef,
  ElementRef,
  HostListener,
  Input,
  OnInit,
  ViewChild,
  inject,
  signal,
} from '@angular/core';
import { ActivatedRoute, NavigationEnd, Router } from '@angular/router';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { AuthService } from '../../../core/services/auth.service';
import { ProjectService } from '../../../core/services/project.service';
import { UserService } from '../../../core/services/user.service';
import { CurrentUserService } from '../../../core/services/current-user.service';
import { UserSearchResult } from '../../../core/models/user.models';
import { UserMenuDropdownComponent } from '../user-menu-dropdown/user-menu-dropdown.component';
import { DIALOG_BOX_IMPORTS } from '../dialog-box/dialog-box.component';
import { TextInputComponent } from '../text-input/text-input.component';
import { ToggleGroupComponent, ToggleGroupOption } from '../toggle-group/toggle-group.component';
import {
  DropdownSelectComponent,
  DropdownSelectOption,
} from '../dropdown-select/dropdown-select.component';
import { ActionButtonComponent } from '../action-button/action-button.component';
import { extractApiErrorMessage } from '../../../core/utils/api-error.util';
import { filter, map, distinctUntilChanged, debounceTime, Subject, switchMap, of } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';

const PROJECT_MENU_ANIMATION_MS = 120;

interface HeaderUserProfile {
  displayName: string;
  username: string;
  email: string;
  profilePictureUrl: string | null;
}

@Component({
  selector: 'app-header-bar',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    UserMenuDropdownComponent,
    ...DIALOG_BOX_IMPORTS,
    TextInputComponent,
    ToggleGroupComponent,
    DropdownSelectComponent,
    ActionButtonComponent,
  ],
  templateUrl: './header-bar.component.html',
  styleUrl: './header-bar.component.css',
})
export class HeaderBarComponent implements OnInit {
  @Input() appearance: 'default' | 'canvas' = 'default';

  private readonly destroyRef = inject(DestroyRef);
  private readonly router = inject(Router);
  private readonly activatedRoute = inject(ActivatedRoute);
  private readonly authService = inject(AuthService);
  private readonly projectService = inject(ProjectService);
  private readonly userService = inject(UserService);
  private readonly currentUser = inject(CurrentUserService);
  private readonly fb = inject(FormBuilder);
  private readonly fallbackAvatarUrl = 'https://github.com/shadcn.png';

  profilePictureUrl: string | null = null;
  displayName = '';
  username = '';
  email = '';
  currentProjectId: number | null = null;
  currentProjectName: string | null = null;
  currentProjectIsPublic: boolean | null = null;
  isProjectContext = false;
  isUserMenuOpen = false;

  readonly isProjectMenuOpen = signal(false);
  readonly showProjectMenu = signal(false);
  readonly isProjectMenuClosing = signal(false);
  readonly isProjectUpdating = signal(false);
  readonly projectNameDraft = signal('');
  readonly projectVisibilityDraft = signal(false);
  readonly projectUpdateError = signal<string | null>(null);

  // Search
  searchQuery = signal('');
  searchResults = signal<UserSearchResult[]>([]);
  isSearchOpen = signal(false);
  isSearchLoading = signal(false);
  private readonly searchSubject = new Subject<string>();

  // Create project dialog
  isCreateDialogOpen = signal(false);
  isCreatingProject = signal(false);
  createDialogError = signal<string | null>(null);
  readonly createProjectFormId = 'header-create-project-form';
  readonly createProjectForm = this.fb.nonNullable.group({
    name: ['Untitled Project', [Validators.required, Validators.maxLength(120)]],
    isPublic: [false],
  });
  readonly visibilityOptions: DropdownSelectOption[] = [
    { label: 'Private', value: false },
    { label: 'Public', value: true },
  ];
  readonly projectVisibilityOptions: ToggleGroupOption[] = [
    { label: 'Private', value: false },
    { label: 'Public', value: true },
  ];

  @ViewChild('userMenuContainer')
  userMenuContainer?: ElementRef<HTMLElement>;

  @ViewChild('userMenuDropdownEl', { read: ElementRef })
  userMenuDropdownEl?: ElementRef<HTMLElement>;

  @ViewChild('searchContainer')
  searchContainer?: ElementRef<HTMLElement>;

  @ViewChild('projectMenuContainer')
  projectMenuContainer?: ElementRef<HTMLElement>;

  @ViewChild('projectMenuEl')
  projectMenuEl?: ElementRef<HTMLElement>;

  @ViewChild('projectNameInput')
  projectNameInput?: TextInputComponent;

  private projectMenuCloseTimer: ReturnType<typeof setTimeout> | null = null;

  get avatarUrl(): string {
    return this.profilePictureUrl?.trim() || this.fallbackAvatarUrl;
  }

  ngOnInit(): void {
    this.destroyRef.onDestroy(() => this.clearProjectMenuCloseTimer());

    this.router.events
      .pipe(filter((event) => event instanceof NavigationEnd))
      .pipe(
        map(() => this.getProjectIdFromRoute()),
        distinctUntilChanged(),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((projectId) => this.syncRouteContext(projectId));

    this.syncRouteContext(this.getProjectIdFromRoute());

    this.currentUser
      .load()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (user) => {
          if (user) {
            this.applyProfile({
              displayName: user.displayName,
              username: user.username,
              email: user.email,
              profilePictureUrl: user.profilePictureUrl,
            });
          } else {
            this.resetIdentity();
          }
        },
        error: () => this.resetIdentity(),
      });

    // Search with debounce
    this.searchSubject
      .pipe(
        debounceTime(300),
        distinctUntilChanged(),
        switchMap((query) => {
          if (query.trim().length < 2) {
            this.searchResults.set([]);
            this.isSearchLoading.set(false);
            return of([] as UserSearchResult[]);
          }
          this.isSearchLoading.set(true);
          return this.userService.search(query);
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (results) => {
          this.searchResults.set(results);
          this.isSearchLoading.set(false);
        },
        error: () => {
          this.searchResults.set([]);
          this.isSearchLoading.set(false);
        },
      });
  }

  onSearchInput(query: string): void {
    this.searchQuery.set(query);
    this.searchSubject.next(query);
    if (query.trim().length > 0) {
      this.isSearchOpen.set(true);
    } else {
      this.isSearchOpen.set(false);
      this.searchResults.set([]);
    }
  }

  onSearchFocus(): void {
    if (this.searchQuery().trim().length >= 2) {
      this.isSearchOpen.set(true);
    }
  }

  clearSearch(): void {
    this.searchQuery.set('');
    this.searchResults.set([]);
    this.isSearchOpen.set(false);
    this.searchSubject.next('');
  }

  selectSearchResult(result: UserSearchResult): void {
    this.searchQuery.set('');
    this.searchResults.set([]);
    this.isSearchOpen.set(false);
    void this.router.navigate(['/', result.username]);
  }

  navigateToNewProject(): void {
    this.openCreateProjectDialog();
  }

  toggleProjectMenu(): void {
    if (this.isProjectMenuOpen()) {
      this.closeProjectMenu();
      return;
    }

    this.openProjectMenu();
  }

  openProjectMenu(): void {
    if (!this.isProjectContext || !this.currentProjectName || this.isProjectUpdating()) {
      return;
    }

    this.clearProjectMenuCloseTimer();

    this.projectNameDraft.set(this.currentProjectName);
    this.projectVisibilityDraft.set(this.currentProjectIsPublic ?? false);
    this.projectUpdateError.set(null);
    this.isProjectMenuClosing.set(false);
    this.showProjectMenu.set(true);
    this.isProjectMenuOpen.set(true);

    this.focusProjectNameInput();
  }

  closeProjectMenu(): void {
    if (this.isProjectUpdating()) {
      return;
    }

    this.projectNameDraft.set(this.currentProjectName ?? '');
    this.projectVisibilityDraft.set(this.currentProjectIsPublic ?? false);
    this.projectUpdateError.set(null);
    this.isProjectMenuOpen.set(false);

    if (!this.showProjectMenu()) {
      return;
    }

    this.clearProjectMenuCloseTimer();
    this.isProjectMenuClosing.set(true);
    this.projectMenuCloseTimer = setTimeout(() => {
      this.showProjectMenu.set(false);
      this.isProjectMenuClosing.set(false);
      this.projectMenuCloseTimer = null;
    }, PROJECT_MENU_ANIMATION_MS);
  }

  saveProjectSettings(): void {
    if (!this.isProjectMenuOpen() || this.isProjectUpdating()) {
      return;
    }

    const projectId = this.currentProjectId;
    const nextName = this.projectNameDraft().trim();
    const currentName = this.currentProjectName?.trim() ?? '';
    const nextVisibility = this.projectVisibilityDraft();
    const currentVisibility = this.currentProjectIsPublic ?? false;

    if (projectId === null) {
      this.closeProjectMenu();
      return;
    }

    if (!nextName) {
      this.projectUpdateError.set('Project name is required.');
      this.focusProjectNameInput();
      return;
    }

    if (nextName === currentName && nextVisibility === currentVisibility) {
      this.closeProjectMenu();
      return;
    }

    this.isProjectUpdating.set(true);
    this.projectUpdateError.set(null);

    this.projectService
      .update(projectId, {
        name: nextName,
        isPublic: nextVisibility,
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (project) => {
          this.currentProjectName = project.name;
          this.currentProjectIsPublic = project.isPublic;
          this.projectNameDraft.set(project.name);
          this.projectVisibilityDraft.set(project.isPublic);
          this.projectUpdateError.set(null);
          this.isProjectUpdating.set(false);
          this.closeProjectMenu();
        },
        error: (error: unknown) => {
          this.projectUpdateError.set(extractApiErrorMessage(error, 'Failed to update project.'));
          this.isProjectUpdating.set(false);
          this.focusProjectNameInput();
        },
      });
  }

  openProjectPreview(): void {
    if (this.currentProjectId === null) {
      return;
    }

    const urlTree = this.router.createUrlTree(['project', this.currentProjectId, 'preview']);
    const url = this.router.serializeUrl(urlTree);
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  openCreateProjectDialog(): void {
    this.createDialogError.set(null);
    this.createProjectForm.reset({ name: 'Untitled Project', isPublic: false });
    this.isCreateDialogOpen.set(true);
  }

  closeCreateProjectDialog(): void {
    if (this.isCreatingProject()) return;
    this.isCreateDialogOpen.set(false);
  }

  submitCreateProject(): void {
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
        this.createDialogError.set(extractApiErrorMessage(error, 'Failed to create project.'));
        this.isCreatingProject.set(false);
      },
    });
  }

  private applyProfile(profile: HeaderUserProfile): void {
    this.displayName = profile.displayName;
    this.username = profile.username;
    this.email = profile.email;
    this.profilePictureUrl = profile.profilePictureUrl;
  }

  private resetIdentity(): void {
    this.displayName = '';
    this.username = '';
    this.email = '';
    this.profilePictureUrl = null;
  }

  private syncRouteContext(projectId: number | null) {
    if (projectId === null) {
      this.currentProjectId = null;
      this.isProjectContext = false;
      this.currentProjectName = null;
      this.currentProjectIsPublic = null;
      this.projectNameDraft.set('');
      this.projectVisibilityDraft.set(false);
      this.projectUpdateError.set(null);
      this.isProjectMenuOpen.set(false);
      this.showProjectMenu.set(false);
      this.isProjectMenuClosing.set(false);
      this.clearProjectMenuCloseTimer();
      return;
    }

    this.currentProjectId = projectId;
    this.isProjectContext = true;
    this.currentProjectName = `Project #${projectId}`;
    this.currentProjectIsPublic = null;
    this.projectNameDraft.set(this.currentProjectName);
    this.projectVisibilityDraft.set(false);
    this.projectUpdateError.set(null);
    this.isProjectMenuOpen.set(false);
    this.showProjectMenu.set(false);
    this.isProjectMenuClosing.set(false);
    this.clearProjectMenuCloseTimer();

    this.projectService
      .getById(projectId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (project) => {
          this.currentProjectName = project.name;
          this.currentProjectIsPublic = project.isPublic;
          this.projectNameDraft.set(project.name);
          this.projectVisibilityDraft.set(project.isPublic);
        },
        error: () => {
          this.currentProjectName = `Project #${projectId}`;
          this.currentProjectIsPublic = null;
          this.projectNameDraft.set(this.currentProjectName);
          this.projectVisibilityDraft.set(false);
        },
      });
  }

  private focusProjectNameInput(): void {
    setTimeout(() => {
      this.projectNameInput?.focus(true);
    });
  }

  private clearProjectMenuCloseTimer(): void {
    if (this.projectMenuCloseTimer) {
      clearTimeout(this.projectMenuCloseTimer);
      this.projectMenuCloseTimer = null;
    }
  }

  private getProjectIdFromRoute(): number | null {
    let route: ActivatedRoute | null = this.activatedRoute;
    while (route?.firstChild) {
      route = route.firstChild;
    }

    const routeId = route?.snapshot.paramMap.get('id');
    if (!routeId) {
      return null;
    }

    const projectId = Number.parseInt(routeId, 10);
    return Number.isInteger(projectId) ? projectId : null;
  }

  onLogout() {
    this.isUserMenuOpen = false;
    this.currentUser.invalidate();
    this.authService.logout().subscribe();
    void this.router.navigate(['/login'], { replaceUrl: true });
  }

  toggleUserMenu(): void {
    this.isUserMenuOpen = !this.isUserMenuOpen;
  }

  closeUserMenu(): void {
    this.isUserMenuOpen = false;
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    const target = event.target as Node | null;

    if (this.isProjectMenuOpen()) {
      const triggerEl = this.projectMenuContainer?.nativeElement;
      const menuEl = this.projectMenuEl?.nativeElement;
      if (
        target &&
        !(triggerEl && triggerEl.contains(target)) &&
        !(menuEl && menuEl.contains(target))
      ) {
        this.closeProjectMenu();
      }
    }

    if (this.isUserMenuOpen) {
      const triggerEl = this.userMenuContainer?.nativeElement;
      const panelEl = this.userMenuDropdownEl?.nativeElement;
      if (
        target &&
        !(triggerEl && triggerEl.contains(target)) &&
        !(panelEl && panelEl.contains(target))
      ) {
        this.closeUserMenu();
      }
    }

    if (this.isSearchOpen()) {
      const searchEl = this.searchContainer?.nativeElement;
      if (target && searchEl && !searchEl.contains(target)) {
        this.isSearchOpen.set(false);
      }
    }
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.closeProjectMenu();
    this.closeUserMenu();
    this.isSearchOpen.set(false);
  }
}
