import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';

// Belgian identifiers: the same rules as the API (api-lib/belgium.ts). The browser checks them for a
// quick answer; the server checks them again because it never trusts the browser.

const digitsOnly = (s: string) => s.replace(/[\s.\-/]/g, '');
// BigInt: an IBAN becomes an 18-digit number, too big for exact maths with plain JS numbers (> 2^53).
const mod97 = (digits: string) => Number(BigInt(digits) % 97n);

/** National register number: 11 digits, last 2 = 97 - (first 9 mod 97); "2" in front for people born from 2000. */
export function isValidNationalNumber(value: string): boolean {
  const d = digitsOnly(value);
  if (!/^\d{11}$/.test(d)) return false;
  const base = d.slice(0, 9);
  const check = Number(d.slice(9));
  return 97 - mod97(base) === check || 97 - mod97(`2${base}`) === check;
}

/** Company number (BCE/KBO): 10 digits starting with 0 or 1, last 2 = 97 - (first 8 mod 97). */
export function isValidCompanyNumber(value: string): boolean {
  const d = digitsOnly(value);
  if (!/^[01]\d{9}$/.test(d)) return false;
  return 97 - mod97(d.slice(0, 8)) === Number(d.slice(8));
}

/** Belgian IBAN: BE + 2 check digits + 12 digits; ISO 13616 check (mod 97 = 1). */
export function isValidBelgianIban(value: string): boolean {
  const s = value.replace(/\s/g, '').toUpperCase();
  if (!/^BE\d{14}$/.test(s)) return false;
  const rearranged = s.slice(4) + s.slice(0, 4);
  const numeric = rearranged.replace(/[A-Z]/g, (c) => String(c.charCodeAt(0) - 55));
  return mod97(numeric) === 1;
}

// ---- Angular validators: (control) => null when valid, or an errors object ----
// Empty values are left to Validators.required, so a field can be optional AND checked when filled.

const isEmpty = (v: unknown) => v === null || v === undefined || v === '';

export const nationalNumberValidator: ValidatorFn = (
  c: AbstractControl,
): ValidationErrors | null =>
  isEmpty(c.value) || isValidNationalNumber(String(c.value)) ? null : { nationalNumber: true };

export const companyNumberValidator: ValidatorFn = (c) =>
  isEmpty(c.value) || isValidCompanyNumber(String(c.value)) ? null : { companyNumber: true };

export const belgianIbanValidator: ValidatorFn = (c) =>
  isEmpty(c.value) || isValidBelgianIban(String(c.value)) ? null : { iban: true };

/** A validator FACTORY: ageBetween(18, 100) returns a validator for an ISO date (YYYY-MM-DD). */
export function ageBetween(min: number, max: number, today = new Date()): ValidatorFn {
  return (c) => {
    if (isEmpty(c.value)) return null;
    const birth = new Date(`${String(c.value)}T00:00:00Z`);
    if (Number.isNaN(birth.getTime())) return { date: true };
    let age = today.getUTCFullYear() - birth.getUTCFullYear();
    const beforeBirthday =
      today.getUTCMonth() < birth.getUTCMonth() ||
      (today.getUTCMonth() === birth.getUTCMonth() && today.getUTCDate() < birth.getUTCDate());
    if (beforeBirthday) age--;
    return age < min || age > max ? { age: { min, max, actual: age } } : null;
  };
}

/**
 * A CROSS-FIELD validator, put on the group: the national number starts with the birth date (YYMMDD).
 * It reads two controls, so it can't live on either of them.
 */
export const birthDateMatchesNationalNumber: ValidatorFn = (group) => {
  const birth = group.get('birthDate')?.value as string | null;
  const nn = digitsOnly(String(group.get('nationalNumber')?.value ?? ''));
  if (!birth || nn.length !== 11) return null; // the field validators report those problems
  const yymmdd = birth.slice(2, 4) + birth.slice(5, 7) + birth.slice(8, 10);
  return nn.startsWith(yymmdd) ? null : { birthDateMismatch: true };
};
