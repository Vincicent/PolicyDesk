import { CurrencyPipe, DecimalPipe, PercentPipe } from '@angular/common';
import { httpResource } from '@angular/common/http';
import { Component, computed, DestroyRef, inject, input, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormArray, NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { toApiError } from '../../core/api-error';
import { Client, Fund, Page, Product, RiskProfile } from '../../core/models';
import { AllocationEditor } from '../../shared/funds/allocation-editor';
import { allocationRow, AllocationRow, allocationsValidator } from '../../shared/funds/allocations';
import { FieldError } from '../../shared/validation/field-error';
import {
  MAX_RISK_CLASS,
  ProductTerms,
  projectBranch21,
  projectBranch23,
  riskProfile,
} from './domain/projection';
import { QuotesService, SavedQuote } from './quotes.service';

type Step = 'client' | 'profile' | 'investment' | 'summary';

@Component({
  selector: 'app-quote-wizard',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    CurrencyPipe,
    DecimalPipe,
    PercentPipe,
    AllocationEditor,
    FieldError,
  ],
  templateUrl: './quote-wizard.html',
  styleUrl: './quote-wizard.css',
})
export class QuoteWizard implements OnInit {
  /** ?clientId=12 preselects the client (from the client page). */
  readonly clientId = input<string>();

  private readonly fb = inject(NonNullableFormBuilder);
  private readonly quotes = inject(QuotesService);
  private readonly destroyRef = inject(DestroyRef);

  // Reference data, loaded once.
  protected readonly clients = httpResource<Page<Client>>(() => '/api/clients?pageSize=50');
  protected readonly products = httpResource<Product[]>(() => '/api/products', {
    defaultValue: [],
  });
  protected readonly funds = httpResource<Fund[]>(() => '/api/funds', { defaultValue: [] });

  protected readonly form = this.fb.group({
    client: this.fb.group({
      clientId: this.fb.control<number | null>(null, Validators.required),
      productCode: ['', Validators.required],
    }),
    profile: this.fb.group({
      horizon: this.fb.control<'short' | 'medium' | 'long' | ''>('', Validators.required),
      reaction: this.fb.control<'sell' | 'wait' | 'buy' | ''>('', Validators.required),
      experience: this.fb.control<'none' | 'some' | 'good' | ''>('', Validators.required),
    }),
    investment: this.fb.group({
      premium: [20000, [Validators.required, Validators.min(1)]],
      durationYears: [10, [Validators.required, Validators.min(1), Validators.max(40)]],
      allocations: new FormArray<AllocationRow>([allocationRow(null, 100)], {
        validators: allocationsValidator(
          // Explicit return types: the form, its validator and profile() refer to each other.
          (): number => MAX_RISK_CLASS[this.profile() ?? 'dynamic'],
          () => this.funds.value(),
        ),
      }),
    }),
  });

  /** The whole form value as a signal: every computed() below re-runs when the user changes something. */
  private readonly value = toSignal(this.form.valueChanges, {
    initialValue: this.form.getRawValue(),
  });

  protected readonly step = signal<Step>('client');
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly saved = signal<SavedQuote | null>(null);

  protected readonly client = computed(
    () => this.clients.value()?.items.find((c) => c.id === this.value().client?.clientId) ?? null,
  );
  /** Only the products made for this type of client (person or company). */
  protected readonly availableProducts = computed(() =>
    this.products.value().filter((p) => p.clientType === (this.client()?.type ?? 'person')),
  );
  protected readonly product = computed(
    () => this.products.value().find((p) => p.code === this.value().client?.productCode) ?? null,
  );
  protected readonly isBranch23 = computed(() => this.product()?.branch === 23);

  protected readonly profile = computed<RiskProfile | null>(() => {
    const a = this.value().profile;
    return a?.horizon && a.reaction && a.experience
      ? riskProfile({ horizon: a.horizon, reaction: a.reaction, experience: a.experience })
      : null;
  });

  protected readonly allowedFunds = computed(() =>
    this.funds.value().filter((f) => f.riskClass <= MAX_RISK_CLASS[this.profile() ?? 'dynamic']),
  );

  /** Live projection, recomputed on every keystroke. */
  protected readonly projection = computed(() => {
    const product = this.product();
    const inv = this.value().investment;
    if (!product || !inv?.premium || !inv.durationYears) return null;
    const terms: ProductTerms = {
      branch: product.branch,
      guaranteedRate: product.guaranteedRate,
      entryFeeRate: product.entryFeeRate,
      managementFeeRate: product.managementFeeRate,
      premiumTaxRate: product.premiumTaxRate,
    };
    if (product.branch === 21)
      return { branch: 21 as const, ...projectBranch21(inv.premium, inv.durationYears, terms) };
    const allocations = (inv.allocations ?? [])
      .filter((a) => a.fundId !== null && a.fundId !== undefined)
      .map((a) => ({ fundId: a.fundId!, percent: a.percent ?? 0 }));
    return {
      branch: 23 as const,
      ...projectBranch23(inv.premium, inv.durationYears, terms, allocations, this.funds.value()),
    };
  });

  protected readonly steps = computed(() => {
    const all: { id: Step; label: string }[] = [
      { id: 'client', label: 'Client & product' },
      { id: 'profile', label: 'Risk profile' },
      { id: 'investment', label: 'Investment' },
      { id: 'summary', label: 'Summary' },
    ];
    return this.isBranch23() ? all : all.filter((s) => s.id !== 'profile'); // branch 21: no questionnaire
  });

  get allocations(): FormArray<AllocationRow> {
    return this.form.controls.investment.controls.allocations;
  }

  ngOnInit(): void {
    const preselected = Number(this.clientId());
    if (preselected) this.form.controls.client.controls.clientId.setValue(preselected);

    // The minimum premium depends on the product: change the validators when the product changes.
    // Use the emitted `code`, NOT this.product(): a child control emits BEFORE its parent form, so signals
    // built on form.valueChanges still hold the OLD product at this moment.
    this.form.controls.client.controls.productCode.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((code) => {
        const product = this.products.value().find((p) => p.code === code);
        const premium = this.form.controls.investment.controls.premium;
        premium.setValidators([Validators.required, Validators.min(product?.minPremium ?? 1)]);
        premium.updateValueAndValidity();
        // Branch 21 has no funds: a disabled control is not validated (same trick as the client form).
        if (product?.branch === 23) this.allocations.enable();
        else this.allocations.disable();
      });

    // A new client = maybe another type: forget the product.
    this.form.controls.client.controls.clientId.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.form.controls.client.controls.productCode.setValue(''));

    // The profile changes the max risk: re-run the allocation validator.
    this.form.controls.profile.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.allocations.updateValueAndValidity());
  }

  protected isDone(step: Step): boolean {
    const order = this.steps().map((s) => s.id);
    return order.indexOf(step) < order.indexOf(this.step());
  }

  protected next(): void {
    const group = this.currentGroup();
    if (group?.invalid) {
      group.markAllAsTouched();
      return;
    }
    const order = this.steps().map((s) => s.id);
    this.step.set(order[order.indexOf(this.step()) + 1] ?? 'summary');
  }

  protected back(): void {
    const order = this.steps().map((s) => s.id);
    this.step.set(order[Math.max(0, order.indexOf(this.step()) - 1)] ?? 'client');
  }

  protected save(): void {
    const v = this.form.getRawValue();
    this.saving.set(true);
    this.error.set(null);
    this.quotes
      .save({
        clientId: v.client.clientId!,
        productCode: v.client.productCode,
        premium: v.investment.premium,
        durationYears: v.investment.durationYears,
        allocations: this.isBranch23()
          ? v.investment.allocations.map((a) => ({ fundId: a.fundId!, percent: a.percent }))
          : undefined,
      })
      .subscribe({
        next: (quote) => {
          this.saving.set(false);
          this.saved.set(quote);
        },
        error: (err: unknown) => {
          this.saving.set(false);
          this.error.set(toApiError(err).message);
        },
      });
  }

  protected restart(): void {
    this.saved.set(null);
    this.form.reset();
    this.allocations.clear();
    this.allocations.push(allocationRow(null, 100));
    this.step.set('client');
  }

  protected fundName(id: number | null): string {
    return this.funds.value().find((f) => f.id === id)?.name ?? '?';
  }

  private currentGroup() {
    const groups = this.form.controls;
    return {
      client: groups.client,
      profile: groups.profile,
      investment: groups.investment,
      summary: null,
    }[this.step()];
  }
}
