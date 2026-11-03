import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { ValuationService } from '../policies/valuation.service';
import { RequestFormPage } from './request-form';

const policy = {
  id: 2,
  clientId: 1,
  policyNumber: 'B23-004001',
  branch: 23,
  status: 'active',
  currentValue: 1000,
  clientName: 'Wout',
  productName: 'Invest 23',
};

describe('RequestFormPage', () => {
  let fixture: ComponentFixture<RequestFormPage>;
  let el: HTMLElement;
  let http: HttpTestingController;
  const getValuation = vi.fn(() => of({ surrenderValue: 995 }));

  async function setup(type: string) {
    TestBed.configureTestingModule({
      imports: [RequestFormPage],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([{ path: '**', children: [] }]),
        { provide: ValuationService, useValue: { getValuation } }, // no SOAP in a unit test
      ],
    });
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(RequestFormPage);
    fixture.componentRef.setInput('id', '2');
    fixture.componentRef.setInput('type', type);
    el = fixture.nativeElement as HTMLElement;
    TestBed.tick();
    http.expectOne('/api/policies/2').flush(policy);
    http.expectOne('/api/funds').flush([{ id: 1, name: 'Bonds', riskClass: 2 }]);
    // The client URL depends on the policy: let the resource publish its value, then render again.
    await new Promise((resolve) => setTimeout(resolve));
    TestBed.tick();
    http.expectOne('/api/clients/1').flush({ id: 1, iban: 'BE68 5390 0754 7034' });
    await fixture.whenStable();
  }

  const typeIn = async (selector: string, value: string) => {
    const input = el.querySelector<HTMLInputElement>(selector)!;
    input.value = value;
    input.dispatchEvent(new Event('input'));
    input.dispatchEvent(new Event('blur'));
    await fixture.whenStable();
  };
  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  afterEach(() => {
    http.verify();
    getValuation.mockClear();
  });

  it('prefills the IBAN with the policyholder’s', async () => {
    await setup('partial_surrender');
    expect(el.querySelector<HTMLInputElement>('#iban')!.value).toBe('BE68 5390 0754 7034');
  });

  it('checks the amount against the surrender value, once, after typing stops', async () => {
    await setup('partial_surrender');
    for (const value of ['2', '20', '2000']) {
      await typeIn('#surrenderAmount', value);
      await sleep(100); // human typing speed: faster than the 400 ms debounce
    }
    expect(el.textContent).toContain('Checking with the valuation service');
    expect(el.querySelector<HTMLButtonElement>('button[type=submit]')!.disabled).toBe(true); // pending

    await sleep(400);
    await fixture.whenStable();
    expect(getValuation).toHaveBeenCalledTimes(1); // the earlier values were cancelled
    expect(getValuation).toHaveBeenCalledWith('B23-004001');
    // \s: the currency format puts a NON-BREAKING space before €
    expect(el.textContent).toMatch(/More than the surrender value \(995,00\s€\)/);
  });

  it('sends an extra premium', async () => {
    await setup('extra_premium');
    await typeIn('#premiumAmount', '1500');
    el.querySelector('form')!.dispatchEvent(new Event('submit'));

    const req = http.expectOne('/api/requests');
    expect(req.request.body).toEqual({
      policyId: 2,
      type: 'extra_premium',
      payload: { amount: 1500 },
    });
    req.flush({ id: 9 });
    expect(fixture.componentInstance.hasUnsavedChanges()).toBe(false);
  });
});
