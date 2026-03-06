import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { Component, EventEmitter, Input, Output } from '@angular/core';

@Component({
  selector: 'app-user-menu-dropdown',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './user-menu-dropdown.component.html',
  styleUrl: './user-menu-dropdown.component.css',
})
export class UserMenuDropdownComponent {
  @Input() displayName = '';
  @Input() email = '';
  @Input() avatarUrl = 'https://github.com/shadcn.png';
  @Input() isOpen = false;

  @Output() logoutClicked = new EventEmitter<void>();
  @Output() closeRequested = new EventEmitter<void>();

  onLogout(): void {
    this.closeRequested.emit();
    this.logoutClicked.emit();
  }

  closeMenu(): void {
    this.closeRequested.emit();
  }
}
