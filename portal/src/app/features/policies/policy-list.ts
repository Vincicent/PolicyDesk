import { CurrencyPipe, DatePipe } from '@angular/common';
import { Component, DestroyRef, effect, inject } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import {
  catchError,
  debounceTime,
  distinctUntilChanged,
  map,
  of,
  startWith,
  switchMap,
} from 'rxjs';
import { toApiError } from '../../core/api-error';
import { Page, Policy } from '../../core/models';
import { StatusBadge } from '../../shared/status-badge';
import { PoliciesService, PolicyQuery } from './policies.service';

type ListState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ok'; page: Page<Policy> };

/** Exercise 04: the client list pattern (URL = state, debounced search, switchMap), applied to policies. */
@Component({
  selector: 'app-policy-list',
  imports: [ReactiveFormsModule, RouterLink, CurrencyPipe, DatePipe, StatusBadge],
  templateUrl: './policy-list.html',
})
export class PolicyList {
  private readonly policies = inject(PoliciesService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  protected readonly searchBox = new FormControl('', { nonNullable: true });

  protected readonly query = toSignal(
    this.route.queryParamMap.pipe(
      map((p): PolicyQuery => ({
        search: p.get('search') ?? '',
        branch: (p.get('branch') ?? '') as PolicyQuery['branch'],
        status: (p.get('status') ?? '') as PolicyQuery['status'],
        page: Number(p.get('page') ?? 1),
      })),
    ),
    { requireSync: true },
  );

  protected readonly state = toSignal(
    this.route.queryParamMap.pipe(
      map(() => this.query()),
      switchMap((q) =>
        this.policies.list(q).pipe(
          map((page): ListState => ({ status: 'ok', page })),
          startWith<ListState>({ status: 'loading' }),
          catchError((err: unknown) =>
            of<ListState>({ status: 'error', message: toApiError(err).message }),
          ),
        ),
      ),
    ),
    { initialValue: { status: 'loading' } as ListState },
  );

  constructor() {
    effect(() => {
      const search = this.query().search;
      if (this.searchBox.value.trim() !== search)
        this.searchBox.setValue(search, { emitEvent: false });
    });
    this.searchBox.valueChanges
      .pipe(debounceTime(300), distinctUntilChanged(), takeUntilDestroyed(inject(DestroyRef)))
      .subscribe((search) => this.updateQuery({ search: search.trim(), page: 1 }));
  }

  protected updateQuery(change: Partial<PolicyQuery>): void {
    const next = { ...this.query(), ...change };
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {
        search: next.search || null,
        branch: next.branch || null,
        status: next.status || null,
        page: next.page > 1 ? next.page : null,
      },
    });
  }

  protected totalPages(page: Page<Policy>): number {
    return Math.max(1, Math.ceil(page.total / page.pageSize));
  }

  protected open(policy: Policy): void {
    void this.router.navigate(['/policies', policy.id]);
  }
}
