import {
  Component,
  DestroyRef,
  ElementRef,
  HostListener,
  OnInit,
  ViewChild,
  inject,
  signal,
} from '@angular/core';
import { ActivatedRoute, NavigationEnd, Router, RouterLink } from '@angular/router';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { AuthService } from '../../../core/services/auth.service';
import { ProjectService } from '../../../core/services/project.service';
import { UserService } from '../../../core/services/user.service';
import { CurrentUserService } from '../../../core/services/current-user.service';
import { UserSearchResult } from '../../../core/models/user.models';
import { UserMenuDropdownComponent } from '../user-menu-dropdown/user-menu-dropdown.component';
import { DIALOG_BOX_IMPORTS } from '../dialog-box/dialog-box.component';
import { TextInputComponent } from '../text-input/text-input.component';
import {
  DropdownSelectComponent,
  DropdownSelectOption,
} from '../dropdown-select/dropdown-select.component';
import { ActionButtonComponent } from '../action-button/action-button.component';
import { extractApiErrorMessage } from '../../../core/utils/api-error.util';
import { filter, map, distinctUntilChanged, debounceTime, Subject, switchMap, of } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';

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
    RouterLink,
    UserMenuDropdownComponent,
    ...DIALOG_BOX_IMPORTS,
    TextInputComponent,
    DropdownSelectComponent,
    ActionButtonComponent,
  ],
  templateUrl: './header-bar.component.html',
  styleUrl: './header-bar.component.css',
})
export class HeaderBarComponent implements OnInit {
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
  currentProjectName: string | null = null;
  isProjectContext = false;
  isUserMenuOpen = false;

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

  @ViewChild('userMenuContainer')
  userMenuContainer?: ElementRef<HTMLElement>;

  @ViewChild('searchContainer')
  searchContainer?: ElementRef<HTMLElement>;

  get avatarUrl(): string {
    return this.profilePictureUrl?.trim() || this.fallbackAvatarUrl;
  }

  get profileRouterLink(): string[] {
    return this.username ? ['/', this.username] : ['/'];
  }

  ngOnInit(): void {
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
      this.isProjectContext = false;
      this.currentProjectName = null;
      return;
    }

    this.isProjectContext = true;
    this.currentProjectName = `Project #${projectId}`;

    this.projectService.getById(projectId).subscribe({
      next: (project) => {
        this.currentProjectName = project.name;
      },
      error: () => {
        this.currentProjectName = `Project #${projectId}`;
      },
    });
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

    if (this.isUserMenuOpen) {
      const container = this.userMenuContainer?.nativeElement;
      if (target && container && !container.contains(target)) {
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
    this.closeUserMenu();
    this.isSearchOpen.set(false);
  }
}
