import { CurrencyPipe, DatePipe, DecimalPipe, PercentPipe } from '@angular/common';
import { httpResource } from '@angular/common/http';
import { Component, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { PolicyDetail } from '../../core/models';
import { RequestTypePipe } from '../../shared/request-type.pipe';
import { StatusBadge } from '../../shared/status-badge';
import { PoliciesService } from './policies.service';
import { ReserveChart } from './reserve-chart';
import { SoapFault, Valuation, ValuationService } from './valuation.service';

@Component({
  selector: 'app-policy-detail',
  imports: [
    CurrencyPipe,
    DatePipe,
    DecimalPipe,
    PercentPipe,
    RouterLink,
    StatusBadge,
    RequestTypePipe,
    ReserveChart,
  ],
  templateUrl: './policy-detail.html',
})
export class PolicyDetailPage {
  readonly id = input.required<string>();
  private readonly policies = inject(PoliciesService);
  protected readonly policy = httpResource<PolicyDetail>(() => this.policies.url(this.id()));

  // The legacy SOAP valuation is only called on demand (it's "slow and expensive" in real life).
  private readonly valuationService = inject(ValuationService);
  protected readonly valuation = signal<Valuation | null>(null);
  protected readonly valuationError = signal<string | null>(null);
  protected readonly valuating = signal(false);

  protected askValuation(policyNumber: string): void {
    this.valuating.set(true);
    this.valuationError.set(null);
    this.valuationService.getValuation(policyNumber).subscribe({
      next: (v) => {
        this.valuation.set(v);
        this.valuating.set(false);
      },
      error: (err: unknown) => {
        this.valuationError.set(
          err instanceof SoapFault
            ? `${err.code}: ${err.message}`
            : 'The valuation service is not answering',
        );
        this.valuating.set(false);
      },
    });
  }
}
