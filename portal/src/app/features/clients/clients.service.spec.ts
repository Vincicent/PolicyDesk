import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ClientsService } from './clients.service';

describe('ClientsService', () => {
  let service: ClientsService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(ClientsService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('only sends the filters that are set', () => {
    service.list({ search: '', type: '', page: 1, sort: 'name' }).subscribe();
    const req = http.expectOne((r) => r.url === '/api/clients');
    expect(req.request.params.keys().sort()).toEqual(['page', 'pageSize']);
    req.flush({ items: [], total: 0, page: 1, pageSize: 10 });
  });

  it('maps every filter to a query parameter', () => {
    service.list({ search: 'peet', type: 'company', page: 3, sort: 'createdAt' }, 5).subscribe();
    const req = http.expectOne((r) => r.url === '/api/clients');
    expect(req.request.params.toString()).toBe(
      'page=3&pageSize=5&search=peet&type=company&sort=createdAt&dir=desc',
    );
    req.flush({ items: [], total: 0, page: 3, pageSize: 5 });
  });
});
