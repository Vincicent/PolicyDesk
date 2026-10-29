import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { AuthService } from './auth.service';

/**
 * A functional interceptor: runs for every HttpClient request (same job as the AngularJS authInterceptor).
 * Requests are immutable, so we clone them to add the header.
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const token = auth.token();
  const isOurApi = req.url.startsWith('/api/') || req.url.startsWith('/soap/');
  const request =
    token && isOurApi ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : req;

  return next(request).pipe(
    catchError((err: unknown) => {
      if (err instanceof HttpErrorResponse && err.status === 401 && !req.url.endsWith('/login')) {
        auth.logout(); // expired or invalid token: back to the login page
      }
      return throwError(() => err);
    }),
  );
};
