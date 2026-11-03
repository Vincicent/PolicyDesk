import { CurrencyPipe, DatePipe } from '@angular/common';
import { Component, computed, input, output, signal } from '@angular/core';
import { PolicyRequest, RequestStatus } from '../core/models';
import { RequestTypePipe } from '../shared/request-type.pipe';
import { StatusBadge } from '../shared/status-badge';

type SortField = 'createdAt' | 'type' | 'clientName';

/**
 * the AngularJS request queue (backoffice/app/requests/request-list.*), translated.
 * $ctrl.filters / $ctrl.sort → signals · ng-repeat | filter | orderBy → one computed() · ng-options → @for · '&' → output()
 */
@Component({
  selector: 'app-request-queue',
  imports: [CurrencyPipe, DatePipe, RequestTypePipe, StatusBadge],
  template: `
    <div class="counts">
      @for (s of statuses; track s) {
        <span class="badge">{{ countByStatus()[s] ?? 0 }} {{ s }}</span>
      }
    </div>

    <div class="row">
      <select
        aria-label="Status"
        [value]="status()"
        (change)="status.set($any($event.target).value)"
      >
        <option value="open">Open (pending + in review)</option>
        <option value="all">All</option>
        @for (s of statuses; track s) {
          <option [value]="s">{{ s }}</option>
        }
      </select>
      <select aria-label="Broker" (change)="broker.set($any($event.target).value || null)">
        <option value="">All brokers</option>
        @for (b of brokers(); track b) {
          <option [value]="b">{{ b }}</option>
        }
      </select>
      <input
        aria-label="Search"
        placeholder="Client, policy, broker…"
        (input)="text.set($any($event.target).value)"
      />
    </div>

    <table>
      <thead>
        <tr>
          <th (click)="sortBy('createdAt')">Received {{ arrow('createdAt') }}</th>
          <th (click)="sortBy('type')">Type {{ arrow('type') }}</th>
          <th (click)="sortBy('clientName')">Client {{ arrow('clientName') }}</th>
          <th>Policy</th>
          <th>Broker</th>
          <th class="num">Amount</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        @for (r of visible(); track r.id) {
          <tr class="clickable" (click)="opened.emit(r)">
            <td>{{ r.createdAt | date: 'dd/MM/yyyy HH:mm' }}</td>
            <td>{{ r.type | requestType }}</td>
            <td>{{ r.clientName }}</td>
            <td>{{ r.policyNumber }}</td>
            <td>{{ r.brokerName }}</td>
            <td class="num">{{ r.payload.amount ? (r.payload.amount | currency) : '—' }}</td>
            <td><app-status-badge [status]="r.status" /></td>
          </tr>
        } @empty {
          <tr>
            <td colspan="7" class="muted">No request matches.</td>
          </tr>
        }
      </tbody>
    </table>
  `,
})
export class RequestQueue {
  readonly requests = input.required<PolicyRequest[]>();
  readonly opened = output<PolicyRequest>();

  protected readonly statuses: RequestStatus[] = ['pending', 'in_review', 'approved', 'rejected'];
  protected readonly status = signal<'open' | 'all' | RequestStatus>('open');
  protected readonly broker = signal<string | null>(null);
  protected readonly text = signal('');
  protected readonly sort = signal<{ field: SortField; reverse: boolean }>({
    field: 'createdAt',
    reverse: true,
  });

  protected readonly brokers = computed(() =>
    [...new Set(this.requests().map((r) => r.brokerName))].sort(),
  );

  protected readonly countByStatus = computed(() => {
    const counts: Partial<Record<RequestStatus, number>> = {};
    for (const r of this.requests()) counts[r.status] = (counts[r.status] ?? 0) + 1;
    return counts;
  });

  /** filter:matchesStatus | filter:text | orderBy, in one computed. */
  protected readonly visible = computed(() => {
    const status = this.status();
    const broker = this.broker();
    const text = this.text().trim().toLowerCase();
    const { field, reverse } = this.sort();
    return (
      this.requests()
        .filter((r) =>
          status === 'all'
            ? true
            : status === 'open'
              ? r.status === 'pending' || r.status === 'in_review'
              : r.status === status,
        )
        .filter((r) => !broker || r.brokerName === broker)
        // AngularJS's `filter:text` searches every field, nested ones too: JSON.stringify does the same.
        .filter((r) => !text || JSON.stringify(r).toLowerCase().includes(text))
        .sort((a, b) => a[field].localeCompare(b[field]) * (reverse ? -1 : 1))
    );
  });

  protected sortBy(field: SortField): void {
    this.sort.update((s) => ({ field, reverse: s.field === field ? !s.reverse : false }));
  }

  protected arrow(field: SortField): string {
    const s = this.sort();
    return s.field !== field ? '' : s.reverse ? '▼' : '▲';
  }
}
