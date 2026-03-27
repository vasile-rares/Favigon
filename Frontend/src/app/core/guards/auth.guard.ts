import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { map } from 'rxjs';
import { CurrentUserService } from '../services/current-user.service';

export const authGuard: CanActivateFn = (_route, state) => {
  const currentUser = inject(CurrentUserService);
  const router = inject(Router);

  return currentUser
    .load()
    .pipe(
      map((user) =>
        user !== null
          ? true
          : router.createUrlTree(['/login'], { queryParams: { returnUrl: state.url } }),
      ),
    );
};
