import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { QuoteWizard } from './quote-wizard';

const clients = {
  items: [
    { id: 1, displayName: 'Ann Peeters', type: 'person' },
    { id: 2, displayName: 'Garage Claes BV', type: 'company' },
  ],
  total: 2,
  page: 1,
  pageSize: 50,
};
const products = [
  {
    code: 'SAFE21',
    name: 'Secure 21',
    branch: 21,
    clientType: 'person',
    guaranteedRate: 0.015,
    entryFeeRate: 0.02,
    managementFeeRate: 0,
    minPremium: 2500,
    premiumTaxRate: 0.02,
    description: '',
  },
  {
    code: 'INVEST23',
    name: 'Invest 23',
    branch: 23,
    clientType: 'person',
    guaranteedRate: null,
    entryFeeRate: 0.03,
    managementFeeRate: 0.012,
    minPremium: 5000,
    premiumTaxRate: 0.02,
    description: '',
  },
  {
    code: 'CORP21',
    name: 'Corporate 21',
    branch: 21,
    clientType: 'company',
    guaranteedRate: 0.0125,
    entryFeeRate: 0.015,
    managementFeeRate: 0,
    minPremium: 10000,
    premiumTaxRate: 0.044,
    description: '',
  },
];
const funds = [
  { id: 1, name: 'Global Bonds', riskClass: 2 },
  { id: 4, name: 'Euro Equity', riskClass: 5 },
];

describe('QuoteWizard', () => {
  let fixture: ComponentFixture<QuoteWizard>;
  let el: HTMLElement;
  let http: HttpTestingController;

  async function setup(clientId?: string) {
    TestBed.configureTestingModule({
      imports: [QuoteWizard],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(QuoteWizard);
    if (clientId) fixture.componentRef.setInput('clientId', clientId);
    el = fixture.nativeElement as HTMLElement;
    // NOT whenStable() here: it waits for the 3 pending httpResource requests, which only end when we flush them.
    TestBed.tick(); // render once, so the resources send their requests
    http.expectOne('/api/clients?pageSize=50').flush(clients);
    http.expectOne('/api/products').flush(products);
    http.expectOne('/api/funds').flush(funds);
    await fixture.whenStable();
  }

  const click = async (el: Element | null | undefined) => {
    (el as HTMLElement).click();
    await fixture.whenStable();
  };
  const next = () => click(el.querySelector('button[type=submit]'));
  const steps = () => [...el.querySelectorAll('.step')].map((s) => s.textContent!.trim());
  const active = () => el.querySelector('.step.active')?.textContent?.trim();
  const choose = async (selector: string, text: string) => {
    const select = el.querySelector<HTMLSelectElement>(selector)!;
    select.selectedIndex = [...select.options].findIndex((o) => o.textContent!.includes(text));
    select.dispatchEvent(new Event('change'));
    await fixture.whenStable();
  };

  afterEach(() => http.verify());

  it('only offers the products made for the client type', async () => {
    await setup('2');
    expect([...el.querySelectorAll('.product strong')].map((s) => s.textContent)).toEqual([
      'Corporate 21',
    ]);
  });

  it('branch 21 skips the risk profile and saves without funds', async () => {
    await setup('1');
    await click(el.querySelectorAll('.product input')[0]); // Secure 21
    expect(steps()).toEqual(['1. Client & product', '2. Investment', '3. Summary']);

    await next();
    expect(active()).toBe('2. Investment');
    expect(el.querySelector('app-allocation-editor')).toBeNull();
    expect(el.textContent).toContain('Guaranteed capital');

    await next();
    expect(active()).toBe('3. Summary');
    await click(
      [...el.querySelectorAll('button')].find((b) => b.textContent!.includes('Save the quote')),
    );

    const req = http.expectOne('/api/quotes');
    expect(req.request.body).toEqual({
      clientId: 1,
      productCode: 'SAFE21',
      premium: 20000,
      durationYears: 10,
      allocations: undefined,
    });
    req.flush({ id: 1, reference: 'Q-2026-000001', createdAt: '' });
    await fixture.whenStable();
    expect(el.querySelector('.alert.success')?.textContent).toContain('Q-2026-000001');
  });

  it('branch 23: a defensive client cannot pick an equity fund', async () => {
    await setup('1');
    await click(el.querySelectorAll('.product input')[1]); // Invest 23
    await next();
    expect(active()).toBe('2. Risk profile');

    await next(); // no answers: blocked
    expect(active()).toBe('2. Risk profile');
    for (const value of ['short', 'sell', 'none'])
      await click(el.querySelector(`input[type=radio][value=${value}]`));
    expect(el.querySelector('.alert.info')?.textContent).toContain('defensive');
    await next();

    await choose('#fund-0', 'Euro Equity');
    await next();
    expect(active()).toBe('3. Investment'); // blocked
    expect(el.textContent).toContain('Too risky');

    await choose('#fund-0', 'Global Bonds');
    await next();
    expect(active()).toBe('4. Summary');
  });

  it('the minimum premium follows the product', async () => {
    await setup('1');
    await click(el.querySelectorAll('.product input')[1]); // Invest 23: min 5 000
    await next();
    for (const value of ['long', 'buy', 'good'])
      await click(el.querySelector(`input[type=radio][value=${value}]`));
    await next();
    const premium = el.querySelector<HTMLInputElement>('#premium')!;
    premium.value = '4000';
    premium.dispatchEvent(new Event('input'));
    premium.dispatchEvent(new Event('blur'));
    await fixture.whenStable();
    expect(premium.closest('.field')!.querySelector('.error-text')?.textContent).toBe(
      'At least 5000',
    );
  });
});
