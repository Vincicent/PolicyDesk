// MODERN STYLE (Angular 17+): the same component as open-requests.component.ts.
import { httpResource } from '@angular/common/http';
import { Component, input, output } from '@angular/core';
import { PolicyRequest } from '../core/models';

@Component({
  selector: 'app-open-requests', // standalone by default: no NgModule
  template: `
    <h3>{{ title() }}</h3>
    @if (requests.isLoading()) {
      <p>Loading…</p>
    } @else {
      <ul>
        @for (r of requests.value(); track r.id) {
          <li (click)="selected.emit(r)">{{ r.policyNumber }} · {{ r.type }} · {{ r.status }}</li>
        }
      </ul>
      @if (requests.value().length === 0) {
        <p>No open request.</p>
      }
    }
  `,
})
export class OpenRequests {
  readonly title = input('Open requests'); // signal input instead of @Input()
  readonly selected = output<PolicyRequest>(); // output() instead of @Output() + EventEmitter

  // inject() + httpResource instead of constructor injection + subscribe + ngOnDestroy:
  // the resource is tied to the component and stops by itself.
  protected readonly requests = httpResource<PolicyRequest[]>(() => '/api/requests?status=open', {
    defaultValue: [],
  });
}
