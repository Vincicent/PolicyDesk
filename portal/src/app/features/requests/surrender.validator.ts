import { AbstractControl, AsyncValidatorFn, ValidationErrors } from '@angular/forms';
import { catchError, map, Observable, of, switchMap, timer } from 'rxjs';
import { ValuationService } from '../policies/valuation.service';

/**
 * An ASYNC validator: the limit lives on the server (the legacy valuation service), so validation needs a call.
 * - timer(400) + switchMap = a debounce: Angular unsubscribes from the previous run on each new value,
 *   so only the last value (400 ms after typing stops) reaches the server.
 * - While it runs, control.status is 'PENDING' (control.pending === true).
 * Async validators only run when all the sync validators pass (no call for an empty field).
 */
export function maxSurrenderValidator(
  valuation: ValuationService,
  policyNumber: () => string,
): AsyncValidatorFn {
  return (control: AbstractControl): Observable<ValidationErrors | null> =>
    timer(400).pipe(
      switchMap(() => valuation.getValuation(policyNumber())),
      map((v) =>
        Number(control.value) > v.surrenderValue
          ? { maxSurrender: { max: v.surrenderValue } }
          : null,
      ),
      catchError(() => of({ valuationUnavailable: true })),
    );
}
