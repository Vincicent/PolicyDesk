import { TestBed } from '@angular/core/testing';
import {
  ActivatedRouteSnapshot,
  provideRouter,
  RouterStateSnapshot,
  UrlTree,
} from '@angular/router';
import { authGuard } from './auth.guard';
import { AuthService } from './auth.service';
import { User } from './models';

function runGuard(user: User | null) {
  TestBed.configureTestingModule({
    providers: [provideRouter([]), { provide: AuthService, useValue: { user: () => user } }], // a fake AuthService
  });
  return TestBed.runInInjectionContext(() =>
    authGuard({} as ActivatedRouteSnapshot, {} as RouterStateSnapshot),
  );
}

describe('authGuard', () => {
  it('lets a broker in', () => {
    expect(
      runGuard({ id: 1, username: 'dupont', displayName: 'C', role: 'broker', brokerId: 1 }),
    ).toBe(true);
  });

  it('sends visitors to /login', () => {
    const result = runGuard(null);
    expect(result instanceof UrlTree && result.toString()).toBe('/login');
  });

  it('sends underwriters to /login too', () => {
    const result = runGuard({
      id: 3,
      username: 'martin',
      displayName: 'S',
      role: 'underwriter',
      brokerId: null,
    });
    expect(result instanceof UrlTree).toBe(true);
  });
});
