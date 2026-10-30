import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { ClientFormPage } from './client-form';

describe('ClientFormPage', () => {
  let fixture: ComponentFixture<ClientFormPage>;
  let el: HTMLElement;
  let http: HttpTestingController;

  async function setup(id?: string) {
    TestBed.configureTestingModule({
      imports: [ClientFormPage],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([{ path: '**', children: [] }]),
      ],
    });
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(ClientFormPage);
    if (id) fixture.componentRef.setInput('id', id);
    el = fixture.nativeElement as HTMLElement;
    await fixture.whenStable();
  }

  const type = async (selector: string, value: string) => {
    const input = el.querySelector<HTMLInputElement>(selector)!;
    input.value = value;
    input.dispatchEvent(new Event('input'));
    input.dispatchEvent(new Event('blur'));
    await fixture.whenStable();
  };
  const submit = async () => {
    el.querySelector('form')!.dispatchEvent(new Event('submit'));
    await fixture.whenStable();
  };
  const errors = () => [...el.querySelectorAll('.error-text')].map((e) => e.textContent!.trim());

  afterEach(() => http.verify());

  it('does not call the API while the form is invalid, and shows every error', async () => {
    await setup();
    await submit();

    http.expectNone('/api/clients');
    expect(errors()).toContain('Required');
    expect(errors().length).toBeGreaterThanOrEqual(7);
  });

  it('a company only needs the company fields (the person group is disabled)', async () => {
    await setup();
    el.querySelector<HTMLInputElement>('input[value=company]')!.click();
    await fixture.whenStable();
    await type('#companyName', 'Menuiserie Lambert SRL');
    await type('#companyNumber', '0403.199.702');
    await type('#email', 'info@lambert.example.be');
    await type('#iban', 'BE68 5390 0754 7034');
    await type('#city', 'Namur');
    await submit();

    const req = http.expectOne('/api/clients');
    expect(req.request.body).toEqual({
      type: 'company',
      companyName: 'Menuiserie Lambert SRL',
      companyNumber: '0403.199.702',
      email: 'info@lambert.example.be',
      phone: '',
      iban: 'BE68 5390 0754 7034',
      city: 'Namur',
      language: 'fr',
      riskProfile: null,
    });
    req.flush({ id: 99 });
  });

  it('shows the server errors under the right fields', async () => {
    await setup();
    el.querySelector<HTMLInputElement>('input[value=company]')!.click();
    await fixture.whenStable();
    await type('#companyName', 'X');
    await type('#companyNumber', '0403.199.702');
    await type('#email', 'x@example');
    await type('#iban', 'BE68 5390 0754 7034');
    await type('#city', 'Namur');
    await submit();

    http.expectOne('/api/clients').flush(
      {
        error: {
          code: 'validation_error',
          message: 'Some fields are invalid',
          details: { email: 'Not a valid e-mail address' },
        },
      },
      { status: 400, statusText: 'Bad Request' },
    );
    await fixture.whenStable();

    expect(el.querySelector('.alert.error')?.textContent).toContain('Some fields are invalid');
    const emailField = el.querySelector('#email')!.closest('.field')!;
    expect(emailField.querySelector('.error-text')?.textContent).toContain(
      'Not a valid e-mail address',
    );
  });

  it('in edit mode, loads the client, locks the type and starts unchanged', async () => {
    await setup('7');
    http.expectOne('/api/clients/7').flush({
      id: 7,
      type: 'person',
      firstName: 'Ann',
      lastName: 'Peeters',
      birthDate: '1985-07-30',
      nationalNumber: '85.07.30-033.28',
      companyName: null,
      companyNumber: null,
      email: 'ann@example.be',
      phone: null,
      iban: 'BE68 5390 0754 7034',
      city: 'Namur',
      language: 'nl',
      riskProfile: 'neutral',
    });
    await fixture.whenStable();

    expect(el.querySelector<HTMLInputElement>('#firstName')!.value).toBe('Ann');
    expect(el.querySelector<HTMLSelectElement>('#language')!.value).toBe('nl');
    expect(el.querySelector<HTMLInputElement>('input[value=company]')!.disabled).toBe(true);
    expect(fixture.componentInstance.hasUnsavedChanges()).toBe(false);

    await type('#city', 'Gent');
    expect(fixture.componentInstance.hasUnsavedChanges()).toBe(true);

    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate');
    await submit();
    const req = http.expectOne('/api/clients/7');
    expect(req.request.method).toBe('PUT');
    expect(req.request.body.city).toBe('Gent');
    req.flush({ id: 7 });
    expect(navigate).toHaveBeenCalledWith(['/clients', 7]);
    expect(fixture.componentInstance.hasUnsavedChanges()).toBe(false);
  });
});
