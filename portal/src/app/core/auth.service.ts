import { computed, inject, Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { Observable, tap } from 'rxjs';
import { LoginResponse, User } from './models';

const TOKEN_KEY = 'policydesk.token';
const USER_KEY = 'policydesk.user';

/**
 * Who is signed in. `providedIn: 'root'` = ONE instance for the whole app (a singleton),
 * like an AngularJS .factory(). Components get it with inject(AuthService).
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);

  // A signal holds a value and tells Angular when it changes. Private + writable inside, read-only outside.
  private readonly currentUser = signal<User | null>(this.readStoredUser());
  readonly user = this.currentUser.asReadonly();
  readonly isSignedIn = computed(() => this.currentUser() !== null);

  token(): string | null {
    return sessionStorage.getItem(TOKEN_KEY);
  }

  login(username: string, password: string): Observable<LoginResponse> {
    return this.http.post<LoginResponse>('/api/login', { username, password }).pipe(
      tap(({ token, user }) => {
        sessionStorage.setItem(TOKEN_KEY, token);
        sessionStorage.setItem(USER_KEY, JSON.stringify(user));
        this.currentUser.set(user);
      }),
    );
  }

  logout(): void {
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(USER_KEY);
    this.currentUser.set(null);
    void this.router.navigate(['/login']);
  }

  private readStoredUser(): User | null {
    const json = sessionStorage.getItem(USER_KEY);
    return json ? (JSON.parse(json) as User) : null;
  }
}
