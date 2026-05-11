import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { map } from 'rxjs';
import { UserService } from '../services/user.service';

export const authGuard: CanActivateFn = (_route, state) => {
  const currentUser = inject(UserService);
  const router = inject(Router);

  return currentUser
    .loadCurrentUser()
    .pipe(
      map((user) =>
        user !== null
          ? true
          : router.createUrlTree(['/login'], { queryParams: { returnUrl: state.url } }),
      ),
    );
};
