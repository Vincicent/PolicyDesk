import { Component, computed, input } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { FormArray, ReactiveFormsModule } from '@angular/forms';
import { startWith, switchMap } from 'rxjs';
import { Fund } from '../../core/models';
import { allocationError, AllocationRow, allocationRow, MAX_FUNDS } from './allocations';

/**
 * Edits a FormArray of { fundId, percent } rows. The PARENT owns the array (and its validator);
 * this component only displays and changes it. Used by the quote wizard and the fund switch request.
 */
@Component({
  selector: 'app-allocation-editor',
  imports: [ReactiveFormsModule],
  template: `
    @for (row of array().controls; track row; let i = $index) {
      <div class="row allocation" [formGroup]="row">
        <div class="field" style="flex: 1; min-width: 200px">
          <label [for]="'fund-' + i">Fund</label>
          <select [id]="'fund-' + i" formControlName="fundId">
            <option [ngValue]="null" disabled>Choose a fund</option>
            @for (f of funds(); track f.id) {
              <option [ngValue]="f.id">{{ f.name }} (SRI {{ f.riskClass }})</option>
            }
          </select>
        </div>
        <div class="field" style="width: 110px">
          <label [for]="'percent-' + i">Percent</label>
          <input
            [id]="'percent-' + i"
            type="number"
            min="1"
            max="100"
            step="1"
            formControlName="percent"
          />
        </div>
        <button
          class="btn link"
          type="button"
          (click)="remove(i)"
          [attr.aria-label]="'Remove line ' + (i + 1)"
        >
          Remove
        </button>
      </div>
    }
    <div class="row" style="margin-top: 8px; align-items: center">
      <button class="btn" type="button" (click)="add()" [disabled]="array().length >= maxFunds">
        + Add a fund
      </button>
      <span [class.error-text]="total() !== 100">Total: {{ total() }} %</span>
    </div>
    @if (error(); as message) {
      <p class="error-text">{{ message }}</p>
    }
  `,
  styles: `
    .allocation {
      margin-bottom: 8px;
    }
  `,
})
export class AllocationEditor {
  readonly array = input.required<FormArray<AllocationRow>>();
  readonly funds = input.required<Fund[]>();
  protected readonly maxFunds = MAX_FUNDS;

  // OnPush: re-read the array whenever it emits an event (value, status, rows added/removed).
  private readonly changes = toSignal(
    toObservable(this.array).pipe(switchMap((a) => a.events.pipe(startWith(null)))),
  );

  protected readonly total = computed(() => {
    this.changes();
    return this.array()
      .getRawValue()
      .reduce((sum, r) => sum + (Number(r.percent) || 0), 0);
  });

  protected readonly error = computed(() => {
    this.changes();
    const a = this.array();
    return a.touched || a.dirty ? allocationError(a.errors) : null;
  });

  protected add(): void {
    const missing = Math.max(0, 100 - this.total());
    this.array().push(allocationRow(null, missing)); // propose what's left to reach 100 %
    this.array().markAsDirty();
  }

  protected remove(index: number): void {
    this.array().removeAt(index);
    this.array().markAsDirty();
  }
}
