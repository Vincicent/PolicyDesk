import { FormArray } from '@angular/forms';
import { Fund } from '../../core/models';
import { allocationError, allocationRow, allocationsValidator } from './allocations';

const funds = [
  { id: 1, name: 'Bonds', riskClass: 2 },
  { id: 4, name: 'Equity', riskClass: 5 },
] as Fund[];

function check(rows: [number | null, number][], maxRisk = 7) {
  const array = new FormArray(
    rows.map(([id, pct]) => allocationRow(id, pct)),
    {
      validators: allocationsValidator(
        () => maxRisk,
        () => funds,
      ),
    },
  );
  return array.errors;
}

describe('allocationsValidator', () => {
  it('accepts 100 % spread over different funds', () => {
    expect(
      check([
        [1, 60],
        [4, 40],
      ]),
    ).toBeNull();
  });

  it.each([
    [[], 'noFunds'],
    [[[null, 100]], 'fundMissing'],
    [
      [
        [1, 50],
        [1, 50],
      ],
      'duplicateFund',
    ],
    [
      [
        [1, 0],
        [4, 100],
      ],
      'percentInvalid',
    ],
    [
      [
        [1, 60],
        [4, 30],
      ],
      'total',
    ],
  ] as [[number | null, number][], string][])('%o → %s', (rows, key) => {
    expect(Object.keys(check(rows) ?? {})).toEqual([key]);
  });

  it('refuses a fund above the profile maximum, and names it', () => {
    const errors = check(
      [
        [1, 50],
        [4, 50],
      ],
      3,
    );
    expect(allocationError(errors)).toBe("Too risky for this client's profile (max SRI 3): Equity");
  });
});
