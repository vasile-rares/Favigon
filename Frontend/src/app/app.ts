import { Component, inject, signal } from '@angular/core';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { PendingProjectFlushService } from '@app/core';
import { HeaderBarComponent } from './shared/components/header-bar/header-bar.component';
import { filter } from 'rxjs';

const HIDDEN_HEADER_ROUTES = ['/login', '/reset-password', '/project/'];

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, HeaderBarComponent],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  private readonly pendingProjectFlush = inject(PendingProjectFlushService);
  private readonly router = inject(Router);

  readonly showHeader = signal(false);

  constructor() {
    this.router.events
      .pipe(filter((e) => e instanceof NavigationEnd))
      .subscribe((e: NavigationEnd) => {
        const url = e.urlAfterRedirects;
        this.showHeader.set(!HIDDEN_HEADER_ROUTES.some((r) => url.startsWith(r)));
      });
  }
}
