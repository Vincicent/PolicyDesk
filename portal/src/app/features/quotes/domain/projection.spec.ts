import {
  MAX_RISK_CLASS,
  netInvested,
  ProductTerms,
  projectBranch21,
  projectBranch23,
  riskProfile,
  weightedRiskClass,
} from './projection';

const safe21: ProductTerms = {
  branch: 21,
  guaranteedRate: 0.015,
  entryFeeRate: 0.02,
  managementFeeRate: 0,
  premiumTaxRate: 0.02,
};
const invest23: ProductTerms = {
  branch: 23,
  guaranteedRate: null,
  entryFeeRate: 0.03,
  managementFeeRate: 0.012,
  premiumTaxRate: 0.02,
};
const funds = [
  { id: 1, riskClass: 2 },
  { id: 2, riskClass: 3 },
  { id: 4, riskClass: 5 },
];

describe('netInvested', () => {
  it('takes the premium tax, then the entry fee', () => {
    // 10 000 × 0.98 × 0.98 = 9 604
    expect(netInvested(10_000, safe21)).toBe(9604);
  });

  it('companies pay 4.4 % premium tax', () => {
    expect(netInvested(10_000, { ...safe21, premiumTaxRate: 0.044, entryFeeRate: 0 })).toBe(9560);
  });
});

describe('projectBranch21', () => {
  it('compounds the guaranteed rate every year', () => {
    const p = projectBranch21(10_000, 10, safe21);
    expect(p.net).toBe(9604);
    expect(p.capital).toBeCloseTo(9604 * 1.015 ** 10, 2); // 11 145.81
  });

  it('0 years = the net premium', () => {
    expect(projectBranch21(10_000, 0, safe21).capital).toBe(9604);
  });
});

describe('weightedRiskClass', () => {
  it('weights each fund by its percentage', () => {
    expect(
      weightedRiskClass(
        [
          { fundId: 1, percent: 50 },
          { fundId: 4, percent: 50 },
        ],
        funds,
      ),
    ).toBe(3.5);
  });

  it('is 0 for an empty allocation', () => {
    expect(weightedRiskClass([], funds)).toBe(0);
  });
});

describe('projectBranch23', () => {
  const p = projectBranch23(20_000, 10, invest23, [{ fundId: 2, percent: 100 }], funds);

  it('orders the scenarios', () => {
    expect(p.unfavourable).toBeLessThan(p.moderate);
    expect(p.moderate).toBeLessThan(p.favourable);
  });

  it('moderate = expected return of the risk class minus the management fee', () => {
    // risk class 3 → 3.5 % − 1.2 % = 2.3 % a year
    expect(p.moderate).toBeCloseTo(netInvested(20_000, invest23) * 1.023 ** 10, 2);
  });

  it('a riskier allocation has a wider range', () => {
    const risky = projectBranch23(20_000, 10, invest23, [{ fundId: 4, percent: 100 }], funds);
    expect(risky.favourable - risky.unfavourable).toBeGreaterThan(p.favourable - p.unfavourable);
  });
});

describe('riskProfile', () => {
  it.each([
    [{ horizon: 'short', reaction: 'sell', experience: 'none' }, 'defensive'],
    [{ horizon: 'medium', reaction: 'wait', experience: 'none' }, 'defensive'], // 2 points
    [{ horizon: 'medium', reaction: 'wait', experience: 'some' }, 'neutral'], // 3 points
    [{ horizon: 'long', reaction: 'wait', experience: 'some' }, 'neutral'], // 4 points
    [{ horizon: 'long', reaction: 'buy', experience: 'some' }, 'dynamic'], // 5 points
  ] as const)('%o → %s', (answers, profile) => {
    expect(riskProfile(answers)).toBe(profile);
  });

  it('a defensive client may not hold equity funds (SRI 5)', () => {
    expect(MAX_RISK_CLASS.defensive).toBeLessThan(5);
  });
});
