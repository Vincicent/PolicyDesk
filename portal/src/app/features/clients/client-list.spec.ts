import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { Client, Page } from '../../core/models';
import { ClientList } from './client-list';

const page = (names: string[], total = names.length): Page<Client> => ({
  items: names.map(
    (displayName, i) =>
      ({ id: i + 1, displayName, type: 'person', city: 'Namur', email: 'x@example.be' }) as Client,
  ),
  total,
  page: 1,
  pageSize: 10,
});

describe('ClientList', () => {
  let http: HttpTestingController;
  let harness: RouterTestingHarness;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([{ path: 'clients', component: ClientList }]),
      ],
    });
    http = TestBed.inject(HttpTestingController);
    harness = await RouterTestingHarness.create(); // a real router + outlet, to test URL-driven screens
  });

  afterEach(() => http.verify());

  it('loads the page described by the URL and shows the rows', async () => {
    await harness.navigateByUrl('/clients?search=ann&type=person');

    const req = http.expectOne((r) => r.url === '/api/clients');
    expect(req.request.params.get('search')).toBe('ann');
    expect(req.request.params.get('type')).toBe('person');
    req.flush(page(['Ann Peeters', 'Anna Maes']));
    await harness.fixture.whenStable();

    const rows = harness.routeNativeElement!.querySelectorAll('tbody tr');
    expect([...rows].map((r) => r.querySelector('td')!.textContent!.trim())).toEqual([
      'Ann Peeters',
      'Anna Maes',
    ]);
    expect((harness.routeNativeElement!.querySelector('#search') as HTMLInputElement).value).toBe(
      'ann',
    );
  });

  it('puts the search text in the URL, once the user stops typing', async () => {
    await harness.navigateByUrl('/clients');
    http.expectOne((r) => r.url === '/api/clients').flush(page(['A', 'B']));
    await harness.fixture.whenStable();

    const box = harness.routeNativeElement!.querySelector('#search') as HTMLInputElement;
    const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
    for (const text of ['w', 'wo', 'wou']) {
      box.value = text;
      box.dispatchEvent(new Event('input'));
      await sleep(100); // a human types one key every ~100 ms: shorter than the 300 ms debounce
    }
    await sleep(350); // > debounceTime(300)
    await harness.fixture.whenStable();

    expect(TestBed.inject(Router).url).toBe('/clients?search=wou');
    // only ONE request for the 3 keystrokes
    http
      .expectOne((r) => r.url === '/api/clients' && r.params.get('search') === 'wou')
      .flush(page(['Wout Dupuis']));
  });

  it('shows the API error message', async () => {
    await harness.navigateByUrl('/clients');
    http
      .expectOne((r) => r.url === '/api/clients')
      .flush(
        { error: { code: 'server_error', message: 'Database is sleeping' } },
        { status: 500, statusText: 'Error' },
      );
    await harness.fixture.whenStable();

    expect(harness.routeNativeElement!.querySelector('.alert.error')?.textContent).toContain(
      'Database is sleeping',
    );
  });
});
