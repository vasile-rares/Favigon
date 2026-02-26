import { Component, OnInit, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { environment } from '../../../../environments/environment';
import { AuthService } from '../../../core/services/auth.service';
import { UserMenuDropdownComponent } from '../user-menu-dropdown/user-menu-dropdown.component';

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
  private readonly authService = inject(AuthService);
  private readonly fallbackAvatarUrl = 'https://github.com/shadcn.png';
  private static cachedProfilePictureUrl: string | null | undefined;

  profilePictureUrl: string | null = null;
  displayName = 'Alex Johnson';
  username = 'alexjohnson';
  email = 'alex@example.com';

  get avatarUrl(): string {
    return this.profilePictureUrl?.trim() || this.fallbackAvatarUrl;
  }

  ngOnInit(): void {
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

  onLogout() {
    HeaderBarComponent.cachedProfilePictureUrl = undefined;
    this.authService.logout().subscribe();
    this.router.navigate(['/login']);
  }
}
