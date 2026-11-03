import { CurrencyPipe } from '@angular/common';
import { httpResource } from '@angular/common/http';
import {
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  input,
  OnInit,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormArray, NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { toApiError } from '../../core/api-error';
import { ClientDetail, Fund, PolicyDetail, RequestType } from '../../core/models';
import { HasUnsavedChanges } from '../../core/unsaved-changes.guard';
import { AllocationEditor } from '../../shared/funds/allocation-editor';
import { allocationRow, AllocationRow, allocationsValidator } from '../../shared/funds/allocations';
import { belgianIbanValidator } from '../../shared/validation/belgium';
import { FieldError } from '../../shared/validation/field-error';
import { ValuationService } from '../policies/valuation.service';
import { RequestsService } from './requests.service';
import { maxSurrenderValidator } from './surrender.validator';

@Component({
  selector: 'app-request-form',
  imports: [ReactiveFormsModule, RouterLink, CurrencyPipe, AllocationEditor, FieldError],
  templateUrl: './request-form.html',
})
export class RequestFormPage implements OnInit, HasUnsavedChanges {
  readonly id = input.required<string>(); // the policy id, from /policies/:id/requests/new
  readonly type = input<string>(); // ?type=fund_switch

  private readonly fb = inject(NonNullableFormBuilder);
  private readonly requests = inject(RequestsService);
  private readonly valuation = inject(ValuationService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly policy = httpResource<PolicyDetail>(() => `/api/policies/${this.id()}`);
  // Returning undefined = "don't load yet": the client loads once we know the policy's clientId.
  protected readonly client = httpResource<ClientDetail>(() => {
    const clientId = this.policy.value()?.clientId;
    return clientId ? `/api/clients/${clientId}` : undefined;
  });
  protected readonly funds = httpResource<Fund[]>(() => '/api/funds', { defaultValue: [] });

  protected readonly form = this.fb.group({
    type: this.fb.control<RequestType>('extra_premium'),
    fundSwitch: this.fb.group({
      allocations: new FormArray<AllocationRow>([allocationRow(null, 100)], {
        validators: allocationsValidator(
          () => 7,
          () => this.funds.value(),
        ),
      }),
    }),
    surrender: this.fb.group({
      amount: this.fb.control<number | null>(null, {
        validators: [Validators.required, Validators.min(100)],
        asyncValidators: [
          maxSurrenderValidator(this.valuation, () => this.policy.value()?.policyNumber ?? ''),
        ],
      }),
      iban: ['', [Validators.required, belgianIbanValidator]],
    }),
    premium: this.fb.group({
      amount: this.fb.control<number | null>(null, [
        Validators.required,
        Validators.min(500),
        Validators.max(1_000_000),
      ]),
    }),
  });

  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly isBranch23 = computed(() => this.policy.value()?.branch === 23);
  private sent = false;

  constructor() {
    // The client arrives AFTER ngOnInit (it waits for the policy): prefill the IBAN when it does.
    effect(() => {
      const iban = this.client.value()?.iban;
      const control = this.form.controls.surrender.controls.iban;
      if (iban && !control.value) control.setValue(iban);
    });
  }

  hasUnsavedChanges(): boolean {
    return this.form.dirty && !this.sent;
  }

  ngOnInit(): void {
    const wanted = this.type();
    if (wanted === 'fund_switch' || wanted === 'partial_surrender' || wanted === 'extra_premium') {
      this.form.controls.type.setValue(wanted);
    }
    this.applyType(this.form.controls.type.value);
    this.form.controls.type.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((type) => this.applyType(type));
  }

  get allocations(): FormArray<AllocationRow> {
    return this.form.controls.fundSwitch.controls.allocations;
  }

  /** Pay the surrender to the policyholder's IBAN unless the broker changes it. */
  protected useClientIban(): void {
    const iban = this.client.value()?.iban;
    if (iban) this.form.controls.surrender.controls.iban.setValue(iban);
  }

  protected submit(): void {
    if (this.form.pending) return; // the async validator is still waiting for the valuation service
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const v = this.form.getRawValue();
    const payload =
      v.type === 'fund_switch'
        ? {
            allocations: v.fundSwitch.allocations.map((a) => ({
              fundId: a.fundId!,
              percent: a.percent,
            })),
          }
        : v.type === 'partial_surrender'
          ? { amount: v.surrender.amount!, iban: v.surrender.iban }
          : { amount: v.premium.amount! };
    this.saving.set(true);
    this.error.set(null);
    this.requests.create({ policyId: Number(this.id()), type: v.type, payload }).subscribe({
      next: () => {
        this.sent = true;
        void this.router.navigate(['/policies', this.id()]);
      },
      error: (err: unknown) => {
        this.saving.set(false);
        this.error.set(toApiError(err).message);
      },
    });
  }

  private applyType(type: RequestType): void {
    const groups = {
      fund_switch: 'fundSwitch',
      partial_surrender: 'surrender',
      extra_premium: 'premium',
    } as const;
    for (const [t, name] of Object.entries(groups)) {
      const group = this.form.controls[name];
      if (t === type) group.enable({ emitEvent: false });
      else group.disable({ emitEvent: false });
    }
    if (type === 'partial_surrender' && !this.form.controls.surrender.controls.iban.value)
      this.useClientIban();
  }
}
