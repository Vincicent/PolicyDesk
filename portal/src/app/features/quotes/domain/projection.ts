// Pure business logic for quotes: no Angular, no HTTP. Easy to test, easy to move to the server later.
import { Allocation, Branch, RiskProfile } from '../../../core/models';

export interface ProductTerms {
  branch: Branch;
  guaranteedRate: number | null; // branch 21
  entryFeeRate: number;
  managementFeeRate: number; // branch 23, yearly
  premiumTaxRate: number; // 2 % for persons, 4.4 % for companies (Belgium, simplified)
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** What is really invested: premium − premium tax − entry fee (the fee applies after the tax). */
export function netInvested(premium: number, terms: ProductTerms): number {
  return round2(premium * (1 - terms.premiumTaxRate) * (1 - terms.entryFeeRate));
}

export interface Branch21Projection {
  net: number;
  capital: number; // guaranteed capital at maturity (profit sharing not included: never guaranteed)
}

export function projectBranch21(
  premium: number,
  years: number,
  terms: ProductTerms,
): Branch21Projection {
  const net = netInvested(premium, terms);
  return { net, capital: round2(net * (1 + (terms.guaranteedRate ?? 0)) ** years) };
}

/** Illustrative yearly return by risk class (SRI 1–7). NOT a promise: real KID scenarios are computed differently. */
export const EXPECTED_RETURN: Record<number, number> = {
  1: 0.01,
  2: 0.02,
  3: 0.035,
  4: 0.05,
  5: 0.065,
  6: 0.075,
  7: 0.09,
};

export interface FundRisk {
  id: number;
  riskClass: number;
}

/** Average risk class of an allocation, weighted by the percentages. */
export function weightedRiskClass(allocations: Allocation[], funds: FundRisk[]): number {
  const total = allocations.reduce((s, a) => s + a.percent, 0);
  if (total === 0) return 0;
  const weighted = allocations.reduce(
    (s, a) => s + a.percent * (funds.find((f) => f.id === a.fundId)?.riskClass ?? 0),
    0,
  );
  return weighted / total;
}

export interface Branch23Projection {
  net: number;
  riskClass: number;
  unfavourable: number;
  moderate: number;
  favourable: number;
}

export function projectBranch23(
  premium: number,
  years: number,
  terms: ProductTerms,
  allocations: Allocation[],
  funds: FundRisk[],
): Branch23Projection {
  const net = netInvested(premium, terms);
  const riskClass = weightedRiskClass(allocations, funds);
  const lower = EXPECTED_RETURN[Math.floor(riskClass)] ?? 0;
  const upper = EXPECTED_RETURN[Math.ceil(riskClass)] ?? lower;
  const expected = lower + (upper - lower) * (riskClass - Math.floor(riskClass)); // interpolate between classes
  const moderate = expected - terms.managementFeeRate;
  const spread = 0.012 * riskClass; // riskier funds: wider range of outcomes
  const grow = (rate: number) => round2(net * (1 + rate) ** years);
  return {
    net,
    riskClass,
    unfavourable: grow(moderate - spread),
    moderate: grow(moderate),
    favourable: grow(moderate + spread),
  };
}

// ---------- suitability questionnaire (simplified) ----------

export interface ProfileAnswers {
  horizon: 'short' | 'medium' | 'long'; // when will you need the money?
  reaction: 'sell' | 'wait' | 'buy'; // the value drops 20 %: what do you do?
  experience: 'none' | 'some' | 'good'; // investment experience
}

const POINTS = {
  horizon: { short: 0, medium: 1, long: 2 },
  reaction: { sell: 0, wait: 1, buy: 2 },
  experience: { none: 0, some: 1, good: 2 },
} as const;

/** 0–2 points per answer: 0–2 defensive, 3–4 neutral, 5–6 dynamic. */
export function riskProfile(a: ProfileAnswers): RiskProfile {
  const score =
    POINTS.horizon[a.horizon] + POINTS.reaction[a.reaction] + POINTS.experience[a.experience];
  if (score <= 2) return 'defensive';
  if (score <= 4) return 'neutral';
  return 'dynamic';
}

/** The riskiest fund (SRI) a profile may hold. */
export const MAX_RISK_CLASS: Record<RiskProfile, number> = { defensive: 3, neutral: 4, dynamic: 7 };
