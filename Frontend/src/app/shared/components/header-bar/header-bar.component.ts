import {
  Component,
  DestroyRef,
  ElementRef,
  EventEmitter,
  HostListener,
  Input,
  OnInit,
  Output,
  ViewChild,
  effect,
  inject,
  signal,
} from '@angular/core';
import { ActivatedRoute, NavigationEnd, Router } from '@angular/router';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { AuthService, ProjectService, CurrentUserService, extractApiErrorMessage } from '@app/core';
import { UserMenuDropdownComponent } from '../user-menu-dropdown/user-menu-dropdown.component';
import { DIALOG_BOX_IMPORTS } from '../dialog-box/dialog-box.component';
import { TextInputComponent } from '../text-input/text-input.component';
import { DropdownSelectComponent } from '../dropdown-select/dropdown-select.component';
import type { DropdownSelectOption } from '../dropdown-select/dropdown-select.component';
import { ActionButtonComponent } from '../action-button/action-button.component';
import { filter, map, distinctUntilChanged } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { ProjectSearchComponent } from './project-search/project-search.component';
import { ProjectMenuComponent } from './project-menu/project-menu.component';

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
    ReactiveFormsModule,
    UserMenuDropdownComponent,
    ...DIALOG_BOX_IMPORTS,
    TextInputComponent,
    DropdownSelectComponent,
    ActionButtonComponent,
    ProjectSearchComponent,
    ProjectMenuComponent,
  ],
  templateUrl: './header-bar.component.html',
  styleUrl: './header-bar.component.css',
})
export class HeaderBarComponent implements OnInit {
  @Input() appearance: 'default' | 'canvas' | 'preview' = 'default';
  @Output() readonly runPreviewClicked = new EventEmitter<void>();

  private readonly destroyRef = inject(DestroyRef);
  private readonly router = inject(Router);
  private readonly activatedRoute = inject(ActivatedRoute);
  private readonly authService = inject(AuthService);
  private readonly projectService = inject(ProjectService);
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

  @ViewChild('userMenuDropdownEl', { read: ElementRef })
  userMenuDropdownEl?: ElementRef<HTMLElement>;

  @ViewChild('projectSearch')
  projectSearch?: ProjectSearchComponent;

  @ViewChild('projectMenu')
  projectMenu?: ProjectMenuComponent;

  @ViewChild('projectMenuContainer')
  projectMenuContainer?: ElementRef<HTMLElement>;

  private readonly syncCurrentUserState = effect(() => {
    const user = this.currentUser.user();

    if (user === undefined) {
      return;
    }

    if (user) {
      this.applyProfile({
        displayName: user.displayName,
        username: user.username,
        email: user.email,
        profilePictureUrl: user.profilePictureUrl,
      });
      return;
    }

    this.resetIdentity();
  });

  get avatarUrl(): string {
    return this.profilePictureUrl?.trim() || this.fallbackAvatarUrl;
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
        error: () => this.resetIdentity(),
      });
  }

  // ── Project Menu Delegates ────────────────────────────────

  toggleProjectMenu(): void {
    this.projectMenu?.toggle();
  }

  onProjectRenamed(name: string): void {
    this.currentProjectName = name;
  }

  onProjectVisibilityChanged(isPublic: boolean): void {
    this.currentProjectIsPublic = isPublic;
  }

  // ── Create Project Dialog ─────────────────────────────────

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

  // ── User Menu ─────────────────────────────────────────────

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

  // ── Private ───────────────────────────────────────────────

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
      return;
    }

    this.currentProjectId = projectId;
    this.isProjectContext = true;
    this.currentProjectName = `Project #${projectId}`;
    this.currentProjectIsPublic = null;

    this.projectService
      .getById(projectId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (project) => {
          this.currentProjectName = project.name;
          this.currentProjectIsPublic = project.isPublic;
        },
        error: () => {
          this.currentProjectName = `Project #${projectId}`;
          this.currentProjectIsPublic = null;
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

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    const target = event.target as Node | null;
    if (!target) return;

    this.projectMenu?.closeIfClickedOutside(target, this.projectMenuContainer?.nativeElement);

    if (this.isUserMenuOpen) {
      const triggerEl = this.userMenuContainer?.nativeElement;
      const panelEl = this.userMenuDropdownEl?.nativeElement;
      if (!(triggerEl && triggerEl.contains(target)) && !(panelEl && panelEl.contains(target))) {
        this.closeUserMenu();
      }
    }

    this.projectSearch?.closeIfClickedOutside(target);
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.projectMenu?.close();
    this.closeUserMenu();
    this.projectSearch?.closeDropdown();
  }
}
