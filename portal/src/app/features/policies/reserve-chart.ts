import { CurrencyPipe } from '@angular/common';
import { Component, computed, input } from '@angular/core';
import { B21Year } from '../../core/models';

/** A small SVG bar chart of the branch 21 reserve per year. No chart library: SVG is just a template. */
@Component({
  selector: 'app-reserve-chart',
  imports: [CurrencyPipe],
  template: `
    <svg
      [attr.viewBox]="'0 0 ' + width + ' ' + height"
      role="img"
      aria-label="Reserve at the end of each year"
    >
      @for (bar of bars(); track bar.year) {
        <g>
          <rect
            [attr.x]="bar.x"
            [attr.y]="bar.y"
            [attr.width]="bar.w"
            [attr.height]="bar.h"
            rx="3"
            fill="var(--b21)"
          >
            <title>{{ bar.year }}: {{ bar.reserve | currency }}</title>
          </rect>
          <text
            [attr.x]="bar.x + bar.w / 2"
            [attr.y]="height - 4"
            text-anchor="middle"
            font-size="11"
            fill="var(--muted)"
          >
            {{ bar.label }}
          </text>
        </g>
      }
    </svg>
  `,
  styles: `
    svg {
      width: 100%;
      max-width: 640px; /* the viewBox keeps the proportions: cap the width, the height follows */
      height: auto;
      display: block;
      margin-bottom: 12px;
    }
  `,
})
export class ReserveChart {
  readonly history = input.required<B21Year[]>();
  protected readonly width = 600;
  protected readonly height = 180;

  protected readonly bars = computed(() => {
    const years = this.history();
    const max = Math.max(...years.map((y) => y.reserve), 1);
    const slot = this.width / Math.max(years.length, 1);
    const plot = this.height - 22;
    return years.map((y, i) => {
      const h = Math.max(2, (y.reserve / max) * (plot - 6));
      return {
        year: y.year,
        reserve: y.reserve,
        label: years.length > 10 ? `'${String(y.year).slice(2)}` : String(y.year),
        x: i * slot + slot * 0.15,
        w: slot * 0.7,
        y: plot - h,
        h,
      };
    });
  });
}
