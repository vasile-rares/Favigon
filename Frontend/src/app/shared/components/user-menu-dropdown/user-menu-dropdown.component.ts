import { RouterLink } from '@angular/router';
import {
  afterNextRender,
  Component,
  effect,
  ElementRef,
  inject,
  Injector,
  input,
  NgZone,
  output,
} from '@angular/core';
import { gsap } from 'gsap';
import { FALLBACK_AVATAR_URL } from '@app/core';

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

  private readonly el = inject(ElementRef);
  private readonly zone = inject(NgZone);
  private readonly injector = inject(Injector);

  constructor() {
    effect(() => {
      if (this.isOpen()) {
        this.showPanel = true;
        afterNextRender(() => this.animateOpen(), { injector: this.injector });
      } else if (this.showPanel) {
        this.animateClose();
      }
    });
  }

  private animateOpen(): void {
    const panel = (this.el.nativeElement as HTMLElement).querySelector<HTMLElement>(
      '.user-menu__panel',
    );
    if (!panel) return;
    this.zone.runOutsideAngular(() => {
      gsap.fromTo(
        panel,
        { opacity: 0, scale: 0.88, y: -8, transformOrigin: 'top right' },
        {
          opacity: 1,
          scale: 1,
          y: 0,
          duration: 0.22,
          ease: 'back.out(1.7)',
          clearProps: 'transform',
        },
      );
    });
  }

  private animateClose(): void {
    const panel = (this.el.nativeElement as HTMLElement).querySelector<HTMLElement>(
      '.user-menu__panel',
    );
    if (!panel) {
      this.showPanel = false;
      return;
    }
    this.zone.runOutsideAngular(() => {
      gsap.to(panel, {
        opacity: 0,
        scale: 0.88,
        y: -8,
        duration: 0.15,
        ease: 'power2.in',
        transformOrigin: 'top right',
        onComplete: () => {
          this.zone.run(() => {
            this.showPanel = false;
          });
        },
      });
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
