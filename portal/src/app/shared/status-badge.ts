import { Component, computed, input } from '@angular/core';
import { PolicyStatus, RequestStatus } from '../core/models';

type Status = RequestStatus | PolicyStatus;

const LOOK: Record<Status, { label: string; tone: string }> = {
  pending: { label: 'Pending', tone: 'warning' },
  in_review: { label: 'In review', tone: 'info' },
  approved: { label: 'Approved', tone: 'success' },
  rejected: { label: 'Rejected', tone: 'danger' },
  active: { label: 'Active', tone: 'success' },
  surrendered: { label: 'Surrendered', tone: '' },
  matured: { label: 'Matured', tone: '' },
};

/** <app-status-badge [status]="r.status" /> — the AngularJS statusBadge directive, as a component. */
@Component({
  selector: 'app-status-badge',
  template: `<span class="badge" [class]="look().tone">{{ look().label }}</span>`,
})
export class StatusBadge {
  readonly status = input.required<Status>(); // a signal input: read it with status()
  protected readonly look = computed(() => LOOK[this.status()]);
}
