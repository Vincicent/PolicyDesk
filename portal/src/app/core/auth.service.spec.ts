import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AuthService } from './auth.service';
import { User } from './models';

const claire: User = {
  id: 1,
  username: 'dupont',
  displayName: 'Claire Dupont',
  role: 'broker',
  brokerId: 1,
};

describe('AuthService', () => {
  let service: AuthService;
  let http: HttpTestingController;

  beforeEach(() => {
    sessionStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([{ path: 'login', children: [] }]), // logout() navigates there
      ],
    });
    service = TestBed.inject(AuthService);
    http = TestBed.inject(HttpTestingController); // a fake backend: we answer each request ourselves
  });

  afterEach(() => http.verify()); // fails if a request was sent that the test didn't expect

  it('starts signed out', () => {
    expect(service.isSignedIn()).toBe(false);
    expect(service.token()).toBeNull();
  });

  it('stores the token and the user after a successful login', () => {
    service.login('dupont', 'demo').subscribe();

    const req = http.expectOne('/api/login');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ username: 'dupont', password: 'demo' });
    req.flush({ token: 'abc.def.ghi', user: claire });

    expect(service.user()).toEqual(claire);
    expect(service.isSignedIn()).toBe(true);
    expect(service.token()).toBe('abc.def.ghi');
  });

  it('forgets everything on logout', () => {
    service.login('dupont', 'demo').subscribe();
    http.expectOne('/api/login').flush({ token: 't', user: claire });

    service.logout();

    expect(service.user()).toBeNull();
    expect(service.token()).toBeNull();
  });
});
