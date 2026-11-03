import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

/** Route guard: only signed-in brokers get in; everyone else is sent to /login. */
export const authGuard: CanActivateFn = (_route, state) => {
  const auth = inject(AuthService);
  if (auth.user()?.role === 'broker') return true;
  // a UrlTree = "go there instead".
  return inject(Router).createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
};
