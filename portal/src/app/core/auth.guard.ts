import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

/** Route guard: only signed-in brokers get in; everyone else is sent to /login. */
export const authGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  if (auth.user()?.role === 'broker') return true;
  return inject(Router).createUrlTree(['/login']); // a UrlTree = "go there instead"
};
