// Belgian identifiers. The Angular app checks the same rules (portal/src/app/shared/validation/belgium.ts),
// but a server never trusts the browser, so they are checked again here.

const digitsOnly = (s: string) => s.replace(/[\s.\-/]/g, '');
const mod97 = (digits: string) => Number(BigInt(digits) % 97n);

/** National register number: 11 digits, the last 2 = 97 - (first 9 mod 97); "2" in front for people born from 2000. */
export function isValidNationalNumber(value: string): boolean {
  const d = digitsOnly(value);
  if (!/^\d{11}$/.test(d)) return false;
  const base = d.slice(0, 9);
  const check = Number(d.slice(9));
  return 97 - mod97(base) === check || 97 - mod97(`2${base}`) === check;
}

/** Company number (BCE/KBO): 10 digits starting with 0 or 1, the last 2 = 97 - (first 8 mod 97). */
export function isValidCompanyNumber(value: string): boolean {
  const d = digitsOnly(value);
  if (!/^[01]\d{9}$/.test(d)) return false;
  return 97 - mod97(d.slice(0, 8)) === Number(d.slice(8));
}

/** Belgian IBAN: BE + 2 check digits + 12 digits, valid ISO 13616 check (mod 97 = 1). */
export function isValidBelgianIban(value: string): boolean {
  const s = value.replace(/\s/g, '').toUpperCase();
  if (!/^BE\d{14}$/.test(s)) return false;
  const rearranged = s.slice(4) + s.slice(0, 4);
  const numeric = rearranged.replace(/[A-Z]/g, (c) => String(c.charCodeAt(0) - 55));
  return mod97(numeric) === 1;
}

/** Premium tax on life insurance in Belgium (simplified: 2 % for individuals, 4.4 % for companies). */
export const PREMIUM_TAX = { person: 0.02, company: 0.044 } as const;
