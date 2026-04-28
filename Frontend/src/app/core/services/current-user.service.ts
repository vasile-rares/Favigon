import { Injectable, inject, signal } from '@angular/core';
import { Observable, of } from 'rxjs';
import { catchError, tap } from 'rxjs/operators';
import { UserMe } from '../models/user.models';
import { UserService } from './user.service';

@Injectable({ providedIn: 'root' })
export class CurrentUserService {
  private readonly userService = inject(UserService);

  private readonly _user = signal<UserMe | null | undefined>(undefined);
  readonly user = this._user.asReadonly();

  
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

  
  set(user: UserMe): void {
    this._user.set(user);
  }

  
  invalidate(): void {
    this._user.set(undefined);
  }
}
