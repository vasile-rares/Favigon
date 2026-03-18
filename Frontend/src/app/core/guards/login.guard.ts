import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { catchError, map, of } from 'rxjs';
import { UserService } from '../services/user.service';

export const loginGuard: CanActivateFn = () => {
  const userService = inject(UserService);
  const router = inject(Router);

  return userService.getMe().pipe(
    map((user) => router.createUrlTree(['/', user.username])),
    catchError(() => of(true)),
  );
};
