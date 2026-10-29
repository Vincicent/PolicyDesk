import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { PoliciesService } from './policies.service';

describe('PoliciesService', () => {
  it('maps the filters to query parameters', () => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    const http = TestBed.inject(HttpTestingController);

    TestBed.inject(PoliciesService)
      .list({ search: 'B23', branch: '23', status: 'active', page: 2 })
      .subscribe();

    const req = http.expectOne((r) => r.url === '/api/policies');
    expect(req.request.params.toString()).toBe(
      'page=2&pageSize=10&search=B23&branch=23&status=active',
    );
    req.flush({ items: [], total: 0, page: 2, pageSize: 10 });
    http.verify();
  });
});
