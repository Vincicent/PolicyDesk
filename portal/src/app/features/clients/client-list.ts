import { CurrencyPipe } from '@angular/common';
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
import { Client, ClientType, Page } from '../../core/models';
import { ClientQuery, ClientsService } from './clients.service';

type ListState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ok'; page: Page<Client> };

const PAGE_SIZE = 10;

@Component({
  selector: 'app-client-list',
  imports: [ReactiveFormsModule, RouterLink, CurrencyPipe],
  templateUrl: './client-list.html',
})
export class ClientList {
  private readonly clients = inject(ClientsService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  protected readonly pageSize = PAGE_SIZE;
  protected readonly searchBox = new FormControl('', { nonNullable: true });

  /** The URL (?search=…&type=…&page=…) is the single source of truth: shareable, survives a reload. */
  protected readonly query = toSignal(
    this.route.queryParamMap.pipe(
      map((p): ClientQuery => ({
        search: p.get('search') ?? '',
        type: (p.get('type') ?? '') as ClientType | '',
        page: Number(p.get('page') ?? 1),
        sort: p.get('sort') === 'createdAt' ? 'createdAt' : 'name',
      })),
    ),
    { requireSync: true }, // queryParamMap emits immediately, so the signal always has a value
  );

  protected readonly state = toSignal(
    this.route.queryParamMap.pipe(
      map(() => this.query()),
      // switchMap: a new query CANCELS the previous HTTP call (no out-of-order results).
      switchMap((q) =>
        this.clients.list(q, PAGE_SIZE).pipe(
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
    // URL → box: keeps the box right after Back/Forward or opening a shared link. emitEvent: false = no loop.
    effect(() => {
      const search = this.query().search;
      if (this.searchBox.value.trim() !== search)
        this.searchBox.setValue(search, { emitEvent: false });
    });
    // Typing → wait 300 ms of silence → only if the text changed → update the URL (which reloads the list).
    this.searchBox.valueChanges
      .pipe(debounceTime(300), distinctUntilChanged(), takeUntilDestroyed(inject(DestroyRef)))
      .subscribe((search) => this.updateQuery({ search: search.trim(), page: 1 }));
  }

  protected updateQuery(change: Partial<ClientQuery>): void {
    const next = { ...this.query(), ...change };
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {
        search: next.search || null, // null removes the parameter from the URL
        type: next.type || null,
        page: next.page > 1 ? next.page : null,
        sort: next.sort === 'createdAt' ? 'createdAt' : null,
      },
    });
  }

  protected totalPages(page: Page<Client>): number {
    return Math.max(1, Math.ceil(page.total / page.pageSize));
  }

  protected open(client: Client): void {
    void this.router.navigate(['/clients', client.id]);
  }
}
