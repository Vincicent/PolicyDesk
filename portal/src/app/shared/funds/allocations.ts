import { FormArray, FormControl, FormGroup, ValidationErrors, ValidatorFn } from '@angular/forms';
import { Fund } from '../../core/models';

/** One row of a fund allocation: which fund, what percentage. */
export type AllocationRow = FormGroup<{
  fundId: FormControl<number | null>;
  percent: FormControl<number>;
}>;

export function allocationRow(fundId: number | null = null, percent = 0): AllocationRow {
  return new FormGroup({
    fundId: new FormControl<number | null>(fundId),
    percent: new FormControl(percent, { nonNullable: true }),
  });
}

export const MAX_FUNDS = 4;

/**
 * Validator for the WHOLE array (rules about several rows can't live on one row):
 * at least one fund, each fund once, percentages add up to 100, no fund riskier than the client's profile allows.
 * It takes functions, so it always reads the current max risk class and fund list.
 */
export function allocationsValidator(maxRiskClass: () => number, funds: () => Fund[]): ValidatorFn {
  return (control): ValidationErrors | null => {
    const rows = (control as FormArray<AllocationRow>).getRawValue();
    if (rows.length === 0) return { noFunds: true };
    if (rows.some((r) => r.fundId === null)) return { fundMissing: true };
    const ids = rows.map((r) => r.fundId);
    if (new Set(ids).size !== ids.length) return { duplicateFund: true };
    if (rows.some((r) => !Number.isInteger(r.percent) || r.percent < 1))
      return { percentInvalid: true };
    const total = rows.reduce((sum, r) => sum + r.percent, 0);
    if (total !== 100) return { total: { actual: total } };
    const max = maxRiskClass();
    const tooRisky = funds().filter((f) => ids.includes(f.id) && f.riskClass > max);
    if (tooRisky.length > 0) return { tooRisky: { max, funds: tooRisky.map((f) => f.name) } };
    return null;
  };
}

export function allocationError(errors: ValidationErrors | null): string | null {
  if (!errors) return null;
  if (errors['noFunds']) return 'Choose at least one fund';
  if (errors['fundMissing']) return 'Choose a fund on every line';
  if (errors['duplicateFund']) return 'Each fund only once';
  if (errors['percentInvalid']) return 'Percentages are whole numbers from 1';
  if (errors['total'])
    return `The percentages add up to ${(errors['total'] as { actual: number }).actual} %, not 100 %`;
  if (errors['tooRisky']) {
    const e = errors['tooRisky'] as { max: number; funds: string[] };
    return `Too risky for this client's profile (max SRI ${e.max}): ${e.funds.join(', ')}`;
  }
  return 'Invalid allocation';
}
