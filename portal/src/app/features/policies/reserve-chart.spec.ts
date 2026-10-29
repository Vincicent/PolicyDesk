import { TestBed } from '@angular/core/testing';
import { ReserveChart } from './reserve-chart';

describe('ReserveChart', () => {
  it('draws one bar per year, the biggest reserve as the tallest bar', async () => {
    const fixture = TestBed.createComponent(ReserveChart);
    fixture.componentRef.setInput('history', [
      { year: 2024, guaranteedRate: 0.015, profitSharingRate: 0, reserve: 1000 },
      { year: 2025, guaranteedRate: 0.015, profitSharingRate: 0, reserve: 2000 },
    ]);
    await fixture.whenStable();

    const bars = [...(fixture.nativeElement as HTMLElement).querySelectorAll('rect')];
    const heights = bars.map((b) => Number(b.getAttribute('height')));
    expect(bars).toHaveLength(2);
    expect(heights[1]).toBeCloseTo(heights[0]! * 2, 5);
    expect(fixture.nativeElement.textContent).toContain('2025');
  });
});
