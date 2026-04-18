import { RouterLink } from '@angular/router';
import { Component, effect, input, output } from '@angular/core';
import { FALLBACK_AVATAR_URL } from '@app/core';

const CLOSE_ANIMATION_MS = 120;

@Component({
  selector: 'app-user-menu-dropdown',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './user-menu-dropdown.component.html',
  styleUrl: './user-menu-dropdown.component.css',
})
export class UserMenuDropdownComponent {
  readonly displayName = input('');
  readonly email = input('');
  readonly avatarUrl = input(FALLBACK_AVATAR_URL);
  readonly username = input('');
  readonly isOpen = input(false);

  readonly logoutClicked = output<void>();
  readonly closeRequested = output<void>();

  showPanel = false;
  isClosing = false;
  private closeTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    effect(() => {
      if (this.isOpen()) {
        if (this.closeTimer) {
          clearTimeout(this.closeTimer);
          this.closeTimer = null;
        }
        this.isClosing = false;
        this.showPanel = true;
      } else if (this.showPanel) {
        this.isClosing = true;
        this.closeTimer = setTimeout(() => {
          this.showPanel = false;
          this.isClosing = false;
          this.closeTimer = null;
        }, CLOSE_ANIMATION_MS);
      }
    });
  }

  onLogout(): void {
    this.closeRequested.emit();
    this.logoutClicked.emit();
  }

  closeMenu(): void {
    this.closeRequested.emit();
  }
}
