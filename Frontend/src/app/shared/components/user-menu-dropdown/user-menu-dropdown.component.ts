import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { FALLBACK_AVATAR_URL } from '@app/core';

const CLOSE_ANIMATION_MS = 120;

@Component({
  selector: 'app-user-menu-dropdown',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './user-menu-dropdown.component.html',
  styleUrl: './user-menu-dropdown.component.css',
})
export class UserMenuDropdownComponent implements OnChanges {
  @Input() displayName = '';
  @Input() email = '';
  @Input() avatarUrl = FALLBACK_AVATAR_URL;
  @Input() username = '';
  @Input() isOpen = false;

  @Output() logoutClicked = new EventEmitter<void>();
  @Output() closeRequested = new EventEmitter<void>();

  showPanel = false;
  isClosing = false;
  private closeTimer: ReturnType<typeof setTimeout> | null = null;

  ngOnChanges(changes: SimpleChanges): void {
    if (!changes['isOpen']) return;
    if (this.isOpen) {
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
  }

  onLogout(): void {
    this.closeRequested.emit();
    this.logoutClicked.emit();
  }

  closeMenu(): void {
    this.closeRequested.emit();
  }
}
