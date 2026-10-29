import { CurrencyPipe, DatePipe } from '@angular/common';
import { httpResource } from '@angular/common/http';
import { Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ClientDetail } from '../../core/models';
import { RequestTypePipe } from '../../shared/request-type.pipe';
import { StatusBadge } from '../../shared/status-badge';
import { ClientsService } from './clients.service';

@Component({
  selector: 'app-client-detail',
  imports: [CurrencyPipe, DatePipe, RouterLink, RequestTypePipe, StatusBadge],
  templateUrl: './client-detail.html',
})
export class ClientDetailPage {
  /** Filled from the route /clients/:id, thanks to withComponentInputBinding() in app.config.ts. */
  readonly id = input.required<string>();

  private readonly clients = inject(ClientsService);

  /**
   * httpResource: a signal-based GET. It re-fetches whenever the URL function's signals change (here: id),
   * and gives value(), isLoading(), error() for the template. It goes through HttpClient, so the interceptor runs.
   */
  protected readonly client = httpResource<ClientDetail>(() => this.clients.url(this.id()));

  protected readonly totalValue = computed(() =>
    (this.client.value()?.policies ?? []).reduce((sum, p) => sum + p.currentValue, 0),
  );
}
