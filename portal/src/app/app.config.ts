import { provideHttpClient, withInterceptors } from '@angular/common/http';
import {
  ApplicationConfig,
  DEFAULT_CURRENCY_CODE,
  LOCALE_ID,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { routes } from './app.routes';
import { authInterceptor } from './core/auth.interceptor';
import { APP_LOCALE } from './core/locale';

/** App-wide providers: what used to go in AppModule's `providers` and `imports`. */
export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes, withComponentInputBinding()),
    provideHttpClient(withInterceptors([authInterceptor])),
    { provide: LOCALE_ID, useValue: APP_LOCALE }, // English texts, Belgian formats (see core/locale.ts)
    { provide: DEFAULT_CURRENCY_CODE, useValue: 'EUR' },
  ],
};
