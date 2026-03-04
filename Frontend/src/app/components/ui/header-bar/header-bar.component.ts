import { Component, OnInit, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { ActivatedRoute, NavigationEnd, Router } from '@angular/router';
import { environment } from '../../../../environments/environment';
import { AuthService } from '../../../core/services/auth.service';
import { ProjectService } from '../../../core/services/project.service';
import { UserMenuDropdownComponent } from '../user-menu-dropdown/user-menu-dropdown.component';
import { filter } from 'rxjs';

@Component({
  selector: 'app-header-bar',
  standalone: true,
  imports: [UserMenuDropdownComponent],
  templateUrl: './header-bar.component.html',
  styleUrl: './header-bar.component.css',
})
export class HeaderBarComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly activatedRoute = inject(ActivatedRoute);
  private readonly authService = inject(AuthService);
  private readonly projectService = inject(ProjectService);
  private readonly fallbackAvatarUrl = 'https://github.com/shadcn.png';
  private static cachedProfilePictureUrl: string | null | undefined;

  profilePictureUrl: string | null = null;
  displayName = 'Alex Johnson';
  username = 'alexjohnson';
  email = 'alex@example.com';
  currentProjectName: string | null = null;
  isProjectContext = false;

  get avatarUrl(): string {
    return this.profilePictureUrl?.trim() || this.fallbackAvatarUrl;
  }

  ngOnInit(): void {
    this.syncRouteContext();
    this.router.events
      .pipe(filter((event) => event instanceof NavigationEnd))
      .subscribe(() => this.syncRouteContext());

    if (HeaderBarComponent.cachedProfilePictureUrl !== undefined) {
      this.profilePictureUrl = HeaderBarComponent.cachedProfilePictureUrl;
      return;
    }

    this.http
      .get<{
        displayName?: string | null;
        username?: string | null;
        email?: string | null;
        profilePictureUrl?: string | null;
      }>(`${environment.apiBaseUrl}/users/me`, {
        withCredentials: true,
      })
      .subscribe({
        next: (response) => {
          this.displayName = response.displayName?.trim() || this.displayName;
          this.username = response.username?.trim() || this.username;
          this.email = response.email?.trim() || this.email;
          this.profilePictureUrl = response.profilePictureUrl ?? null;
          HeaderBarComponent.cachedProfilePictureUrl = this.profilePictureUrl;
        },
        error: () => {
          this.profilePictureUrl = null;
          HeaderBarComponent.cachedProfilePictureUrl = null;
        },
      });
  }

  private syncRouteContext() {
    const projectId = this.getProjectIdFromRoute();
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
    HeaderBarComponent.cachedProfilePictureUrl = undefined;
    this.authService.logout().subscribe();
    this.router.navigate(['/login']);
  }
}
