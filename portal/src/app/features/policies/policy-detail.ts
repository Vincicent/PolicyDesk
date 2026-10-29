import { CurrencyPipe, DatePipe, DecimalPipe, PercentPipe } from '@angular/common';
import { httpResource } from '@angular/common/http';
import { Component, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { PolicyDetail } from '../../core/models';
import { RequestTypePipe } from '../../shared/request-type.pipe';
import { StatusBadge } from '../../shared/status-badge';
import { PoliciesService } from './policies.service';
import { ReserveChart } from './reserve-chart';

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
}
