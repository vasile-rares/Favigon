import { CommonModule } from '@angular/common';
import { Component, ElementRef, EventEmitter, HostListener, Input, Output } from '@angular/core';

@Component({
  selector: 'app-user-menu-dropdown',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './user-menu-dropdown.component.html',
  styleUrl: './user-menu-dropdown.component.css',
})
export class UserMenuDropdownComponent {
  @Input() displayName = 'Alex Johnson';
  @Input() email = 'alex@example.com';
  @Input() avatarUrl = 'https://github.com/shadcn.png';

  @Output() settingsClicked = new EventEmitter<void>();
  @Output() logoutClicked = new EventEmitter<void>();

  isOpen = false;

  constructor(private readonly elementRef: ElementRef<HTMLElement>) {}

  toggleMenu(): void {
    this.isOpen = !this.isOpen;
  }

  onSettings(): void {
    this.isOpen = false;
    this.settingsClicked.emit();
  }

  onLogout(): void {
    this.isOpen = false;
    this.logoutClicked.emit();
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (!this.isOpen) {
      return;
    }

    const target = event.target as Node | null;
    if (target && !this.elementRef.nativeElement.contains(target)) {
      this.isOpen = false;
    }
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.isOpen = false;
  }
}
