import { TestBed } from '@angular/core/testing';
import { StatusBadge } from './status-badge';

describe('StatusBadge', () => {
  it('shows a readable label with the right colour', async () => {
    const fixture = TestBed.createComponent(StatusBadge);
    fixture.componentRef.setInput('status', 'in_review'); // how tests set an input()
    await fixture.whenStable();

    const badge = (fixture.nativeElement as HTMLElement).querySelector('.badge')!;
    expect(badge.textContent).toBe('In review');
    expect(badge.classList).toContain('info');
  });

  it('updates when the input changes', async () => {
    const fixture = TestBed.createComponent(StatusBadge);
    fixture.componentRef.setInput('status', 'pending');
    await fixture.whenStable();
    fixture.componentRef.setInput('status', 'approved');
    await fixture.whenStable();

    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Approved');
  });
});
