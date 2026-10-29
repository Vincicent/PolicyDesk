import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { Login } from './login';

// a component test. We drive the real template like a user would.
describe('Login', () => {
  let http: HttpTestingController;

  async function setup() {
    sessionStorage.clear();
    TestBed.configureTestingModule({
      imports: [Login],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([
          { path: 'dashboard', children: [] },
          { path: 'login', children: [] },
        ]),
      ],
    });
    http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(Login);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const type = (selector: string, value: string) => {
      const input = el.querySelector<HTMLInputElement>(selector)!;
      input.value = value;
      input.dispatchEvent(new Event('input'));
    };
    return { fixture, el, type };
  }

  it('shows the API message when the password is wrong', async () => {
    const { fixture, el, type } = await setup();
    type('#password', 'wrong');
    await fixture.whenStable();
    el.querySelector('form')!.dispatchEvent(new Event('submit'));

    http
      .expectOne('/api/login')
      .flush(
        { error: { code: 'invalid_credentials', message: 'Wrong username or password' } },
        { status: 401, statusText: 'Unauthorized' },
      );
    await fixture.whenStable();

    expect(el.querySelector('.alert.error')?.textContent).toContain('Wrong username or password');
  });

  it('goes to the dashboard after a broker signs in', async () => {
    const { fixture, el, type } = await setup();
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate');
    type('#password', 'demo');
    await fixture.whenStable();
    el.querySelector('form')!.dispatchEvent(new Event('submit'));

    http.expectOne('/api/login').flush({
      token: 'a.b.c',
      user: { id: 1, username: 'dupont', displayName: 'Claire', role: 'broker', brokerId: 1 },
    });

    expect(navigate).toHaveBeenCalledWith(['/dashboard']);
  });

  it('refuses underwriters', async () => {
    const { fixture, el, type } = await setup();
    type('#username', 'martin');
    type('#password', 'demo');
    await fixture.whenStable();
    el.querySelector('form')!.dispatchEvent(new Event('submit'));

    http.expectOne('/api/login').flush({
      token: 'a.b.c',
      user: {
        id: 3,
        username: 'martin',
        displayName: 'Sophie',
        role: 'underwriter',
        brokerId: null,
      },
    });
    await fixture.whenStable();

    expect(el.querySelector('.alert.error')?.textContent).toContain('back-office');
    expect(sessionStorage.getItem('policydesk.token')).toBeNull();
  });
});
