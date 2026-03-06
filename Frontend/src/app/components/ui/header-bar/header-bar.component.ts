import {
  Component,
  DestroyRef,
  ElementRef,
  HostListener,
  OnInit,
  ViewChild,
  inject,
} from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { ActivatedRoute, NavigationEnd, Router, RouterLink } from '@angular/router';
import { environment } from '../../../../environments/environment';
import { AuthService } from '../../../core/services/auth.service';
import { ProjectService } from '../../../core/services/project.service';
import { UserMenuDropdownComponent } from '../user-menu-dropdown/user-menu-dropdown.component';
import { filter, map, distinctUntilChanged } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

interface HeaderUserProfile {
  displayName: string;
  username: string;
  email: string;
  profilePictureUrl: string | null;
}

@Component({
  selector: 'app-header-bar',
  standalone: true,
  imports: [UserMenuDropdownComponent, RouterLink],
  templateUrl: './header-bar.component.html',
  styleUrl: './header-bar.component.css',
})
export class HeaderBarComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly destroyRef = inject(DestroyRef);
  private readonly router = inject(Router);
  private readonly activatedRoute = inject(ActivatedRoute);
  private readonly authService = inject(AuthService);
  private readonly projectService = inject(ProjectService);
  private readonly fallbackAvatarUrl = 'https://github.com/shadcn.png';
  private static cachedProfile: HeaderUserProfile | null | undefined;

  profilePictureUrl: string | null = null;
  displayName = '';
  username = '';
  email = '';
  currentProjectName: string | null = null;
  isProjectContext = false;
  isUserMenuOpen = false;

  @ViewChild('userMenuContainer')
  userMenuContainer?: ElementRef<HTMLElement>;

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

    if (HeaderBarComponent.cachedProfile) {
      this.applyProfile(HeaderBarComponent.cachedProfile);
      return;
    }

    this.http
      .get<{
        displayName?: string | null;
        username?: string | null;
        email?: string | null;
        profilePictureUrl?: string | null;
      }>(`${environment.apiBaseUrl}/users/me`)
      .subscribe({
        next: (response) => {
          const username = response.username?.trim() || '';
          const email = response.email?.trim() || '';
          const displayName = response.displayName?.trim() || username || email;

          const profile: HeaderUserProfile = {
            displayName,
            username,
            email,
            profilePictureUrl: response.profilePictureUrl ?? null,
          };

          this.applyProfile(profile);
          HeaderBarComponent.cachedProfile = profile;
        },
        error: () => {
          this.resetIdentity();
          HeaderBarComponent.cachedProfile = undefined;
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
    HeaderBarComponent.cachedProfile = undefined;
    this.authService.logout().subscribe();
    this.router.navigate(['/login']);
  }

  toggleUserMenu(): void {
    this.isUserMenuOpen = !this.isUserMenuOpen;
  }

  closeUserMenu(): void {
    this.isUserMenuOpen = false;
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (!this.isUserMenuOpen) {
      return;
    }

    const target = event.target as Node | null;
    const container = this.userMenuContainer?.nativeElement;

    if (target && container && !container.contains(target)) {
      this.closeUserMenu();
    }
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.closeUserMenu();
  }
}
