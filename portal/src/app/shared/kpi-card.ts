import { Component, input } from '@angular/core';

@Component({
  selector: 'app-kpi-card',
  template: `
    <div class="kpi">
      <div class="label">{{ label() }}</div>
      <div class="value"><ng-content /></div>
      @if (hint(); as text) {
        <div class="muted">{{ text }}</div>
      }
    </div>
  `,
})
export class KpiCard {
  readonly label = input.required<string>();
  readonly hint = input<string>(); // optional: undefined when not given
}
