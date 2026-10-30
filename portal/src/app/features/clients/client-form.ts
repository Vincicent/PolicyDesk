import { Component, DestroyRef, inject, input, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  AbstractControl,
  NonNullableFormBuilder,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { toApiError } from '../../core/api-error';
import { ClientType, RiskProfile } from '../../core/models';
import { HasUnsavedChanges } from '../../core/unsaved-changes.guard';
import {
  ageBetween,
  belgianIbanValidator,
  birthDateMatchesNationalNumber,
  companyNumberValidator,
  nationalNumberValidator,
} from '../../shared/validation/belgium';
import { FieldError } from '../../shared/validation/field-error';
import { ClientInput, ClientsService } from './clients.service';

/** Where each API field lives in our form, to show the server's 400 errors next to the right input. */
const FIELD_PATHS: Record<string, string> = {
  type: 'type',
  firstName: 'person.firstName',
  lastName: 'person.lastName',
  birthDate: 'person.birthDate',
  nationalNumber: 'person.nationalNumber',
  companyName: 'company.companyName',
  companyNumber: 'company.companyNumber',
  email: 'contact.email',
  phone: 'contact.phone',
  iban: 'contact.iban',
  city: 'contact.city',
  language: 'contact.language',
  riskProfile: 'riskProfile',
};

/** One component for /clients/new and /clients/:id/edit. */
@Component({
  selector: 'app-client-form',
  imports: [ReactiveFormsModule, RouterLink, FieldError],
  templateUrl: './client-form.html',
})
export class ClientFormPage implements OnInit, HasUnsavedChanges {
  readonly id = input<string>(); // undefined on /clients/new

  private readonly fb = inject(NonNullableFormBuilder); // nonNullable: reset() goes back to the initial values, not null
  private readonly clients = inject(ClientsService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly form = this.fb.group({
    type: this.fb.control<ClientType>('person'),
    person: this.fb.group(
      {
        firstName: ['', Validators.required],
        lastName: ['', Validators.required],
        birthDate: ['', [Validators.required, ageBetween(18, 100)]],
        nationalNumber: ['', [Validators.required, nationalNumberValidator]],
      },
      { validators: birthDateMatchesNationalNumber }, // cross-field rule on the GROUP
    ),
    company: this.fb.group({
      companyName: ['', Validators.required],
      companyNumber: ['', [Validators.required, companyNumberValidator]],
    }),
    contact: this.fb.group({
      email: ['', [Validators.required, Validators.email]],
      phone: ['', Validators.pattern(/^\+?[\d\s]{8,20}$/)],
      iban: ['', [Validators.required, belgianIbanValidator]],
      city: ['', Validators.required],
      language: this.fb.control<'fr' | 'nl' | 'en'>('fr'),
    }),
    riskProfile: this.fb.control<RiskProfile | ''>(''),
  });

  protected readonly loading = signal(false);
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);
  private saved = false;

  ngOnInit(): void {
    // A DISABLED group is skipped by validation and left out of form.value: perfect for "person OR company".
    this.applyType(this.form.controls.type.value);
    this.form.controls.type.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((type) => this.applyType(type));

    const id = this.id();
    if (id) this.load(id); // inputs are set before ngOnInit, so id() is ready here
  }

  hasUnsavedChanges(): boolean {
    return this.form.dirty && !this.saved;
  }

  protected isEdit(): boolean {
    return this.id() !== undefined;
  }

  protected submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched(); // show every error at once
      return;
    }
    this.saving.set(true);
    this.error.set(null);
    const id = this.id();
    const request = id
      ? this.clients.update(id, this.toInput())
      : this.clients.create(this.toInput());
    request.subscribe({
      next: (client) => {
        this.saved = true;
        void this.router.navigate(['/clients', client.id]);
      },
      error: (err: unknown) => {
        this.saving.set(false);
        const apiError = toApiError(err);
        this.error.set(apiError.message);
        // { details: { iban: 'Not a valid Belgian IBAN' } } → error under the IBAN field
        for (const [field, message] of Object.entries(apiError.details ?? {})) {
          const control = this.form.get(FIELD_PATHS[field] ?? field);
          control?.setErrors({ server: message });
          control?.markAsTouched();
        }
      },
    });
  }

  protected groupError(): string | null {
    const person = this.form.controls.person;
    const touched = person.controls.birthDate.touched && person.controls.nationalNumber.touched;
    return touched && person.hasError('birthDateMismatch')
      ? 'The national number must start with the birth date (YYMMDD)'
      : null;
  }

  private applyType(type: ClientType): void {
    const { person, company } = this.form.controls;
    if (type === 'person') {
      person.enable({ emitEvent: false });
      company.disable({ emitEvent: false });
    } else {
      company.enable({ emitEvent: false });
      person.disable({ emitEvent: false });
    }
  }

  private load(id: string): void {
    this.loading.set(true);
    this.clients.get(id).subscribe({
      next: (c) => {
        this.form.patchValue({
          type: c.type,
          person: {
            firstName: c.firstName ?? '',
            lastName: c.lastName ?? '',
            birthDate: c.birthDate ?? '',
            nationalNumber: c.nationalNumber ?? '',
          },
          company: { companyName: c.companyName ?? '', companyNumber: c.companyNumber ?? '' },
          contact: {
            email: c.email,
            phone: c.phone ?? '',
            iban: c.iban,
            city: c.city,
            language: c.language,
          },
          riskProfile: c.riskProfile ?? '',
        });
        this.form.controls.type.disable(); // the API refuses a type change
        this.form.markAsPristine(); // loading data is not "a change by the user"
        this.loading.set(false);
      },
      error: (err: unknown) => {
        this.loading.set(false);
        this.error.set(toApiError(err).message);
      },
    });
  }

  private toInput(): ClientInput {
    const v = this.form.getRawValue(); // getRawValue() includes disabled controls (form.value doesn't)
    const base = { ...v.contact, riskProfile: v.riskProfile || null };
    return v.type === 'person'
      ? { type: 'person', ...v.person, ...base }
      : { type: 'company', ...v.company, ...base };
  }
}
