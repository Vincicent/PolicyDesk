import { TestBed } from '@angular/core/testing';
import { PolicyRequest } from '../core/models';
import { RequestQueue } from './request-queue';

const r = (
  id: number,
  status: PolicyRequest['status'],
  brokerName: string,
  clientName: string,
  createdAt: string,
) =>
  ({
    id,
    status,
    brokerName,
    clientName,
    createdAt,
    type: 'extra_premium',
    policyNumber: `B21-00${id}`,
    payload: { amount: 1000 },
  }) as PolicyRequest;

const requests = [
  r(1, 'pending', 'Dupont', 'Ann Peeters', '2026-10-20T10:00:00Z'),
  r(2, 'in_review', 'Janssens', 'Wout Maes', '2026-10-22T10:00:00Z'),
  r(3, 'approved', 'Dupont', 'Lotte Claes', '2026-10-21T10:00:00Z'),
];

describe('RequestQueue (exercise 08)', () => {
  async function setup() {
    const fixture = TestBed.createComponent(RequestQueue);
    fixture.componentRef.setInput('requests', requests);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const clients = () =>
      [...el.querySelectorAll('tbody tr')].map((tr) => tr.children[2]?.textContent?.trim());
    const change = async (label: string, value: string, event = 'change') => {
      const control = el.querySelector<HTMLInputElement>(`[aria-label="${label}"]`)!;
      control.value = value;
      control.dispatchEvent(new Event(event));
      await fixture.whenStable();
    };
    return { fixture, el, clients, change };
  }

  it('shows the open requests, newest first, with the counters', async () => {
    const { el, clients } = await setup();
    expect(clients()).toEqual(['Wout Maes', 'Ann Peeters']);
    expect(el.querySelector('.counts')!.textContent).toContain('1 approved');
  });

  it('filters by status, broker and text, like the AngularJS queue', async () => {
    const { clients, change } = await setup();
    await change('Status', 'all');
    expect(clients()).toHaveLength(3);
    await change('Broker', 'Dupont');
    expect(clients()).toEqual(['Lotte Claes', 'Ann Peeters']);
    await change('Search', 'peet', 'input');
    expect(clients()).toEqual(['Ann Peeters']);
  });

  it('sorts by client when the header is clicked, and reverses on a second click', async () => {
    const { fixture, el, clients, change } = await setup();
    await change('Status', 'all');
    const header = el.querySelectorAll('th')[2] as HTMLElement;
    header.click();
    await fixture.whenStable();
    expect(clients()).toEqual(['Ann Peeters', 'Lotte Claes', 'Wout Maes']);
    header.click();
    await fixture.whenStable();
    expect(clients()).toEqual(['Wout Maes', 'Lotte Claes', 'Ann Peeters']);
  });
});
