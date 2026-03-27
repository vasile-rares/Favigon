import { Injectable, inject, signal } from '@angular/core';
import { Observable, of } from 'rxjs';
import { catchError, tap } from 'rxjs/operators';
import { UserMe } from '../models/user.models';
import { UserService } from './user.service';

/**
 * Singleton service that caches the authenticated user.
 * - `undefined` — not yet loaded
 * - `null`      — loaded but unauthenticated
 * - `UserMe`    — loaded and authenticated
 */
@Injectable({ providedIn: 'root' })
export class CurrentUserService {
  private readonly userService = inject(UserService);

  private readonly _user = signal<UserMe | null | undefined>(undefined);
  readonly user = this._user.asReadonly();

  /**
   * Returns the cached user immediately if available, otherwise fetches from
   * the API and caches the result. Returns `null` when unauthenticated.
   */
  load(): Observable<UserMe | null> {
    const cached = this._user();
    if (cached !== undefined) return of(cached);

    return this.userService.getMe().pipe(
      tap((user) => this._user.set(user)),
      catchError(() => {
        this._user.set(null);
        return of(null);
      }),
    );
  }

  /**
   * Updates the cached user directly (e.g. after login or profile update).
   */
  set(user: UserMe): void {
    this._user.set(user);
  }

  /**
   * Clears the cache so the next `load()` call fetches fresh data from the API.
   * Call this after logout.
   */
  invalidate(): void {
    this._user.set(undefined);
  }
}
