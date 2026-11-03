import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { PolicyRequest } from '../core/models';
import { LegacyRequestsModule } from './open-requests.component';
import { OpenRequests } from './open-requests';

const open = [
  { id: 1, policyNumber: 'B23-004001', type: 'fund_switch', status: 'pending' },
  { id: 2, policyNumber: 'B21-001003', type: 'extra_premium', status: 'in_review' },
] as PolicyRequest[];

// A host that uses BOTH versions, to prove they behave the same.
@Component({
  imports: [LegacyRequestsModule, OpenRequests], // a standalone component can import an NgModule
  template: `
    <app-open-requests-legacy title="Legacy" (selected)="picked = $event" />
    <app-open-requests title="Modern" (selected)="picked = $event" />
  `,
})
class Host {
  picked: PolicyRequest | null = null;
}

describe('legacy vs modern component', () => {
  it('render the same list and emit the same event', async () => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    const http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(Host);
    const el = fixture.nativeElement as HTMLElement;
    TestBed.tick(); // the legacy component calls in ngOnInit; the resource sends its call a moment later
    await new Promise((resolve) => setTimeout(resolve));

    const calls = http.match('/api/requests?status=open');
    expect(calls).toHaveLength(2); // one call per component
    for (const req of calls) req.flush(open);
    await fixture.whenStable();

    const [legacy, modern] = [...el.querySelectorAll('ul')].map((ul) =>
      [...ul.querySelectorAll('li')].map((li) => li.textContent!.trim()),
    );
    expect(legacy).toEqual([
      'B23-004001 · fund_switch · pending',
      'B21-001003 · extra_premium · in_review',
    ]);
    expect(modern).toEqual(legacy);
    expect(el.querySelectorAll('h3')[0]!.textContent).toBe('Legacy');

    (el.querySelectorAll('li')[3] as HTMLElement).click(); // modern list, second request
    expect(fixture.componentInstance.picked?.id).toBe(2);
    http.verify();
  });
});
