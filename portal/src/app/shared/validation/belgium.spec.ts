import { FormControl, FormGroup } from '@angular/forms';
import {
  ageBetween,
  birthDateMatchesNationalNumber,
  belgianIbanValidator,
  isValidBelgianIban,
  isValidCompanyNumber,
  isValidNationalNumber,
} from './belgium';

describe('Belgian identifiers', () => {
  it.each([
    ['85.07.30-033.28', true], // born 1985: 850730033 mod 97 = 69 → 97 - 69 = 28
    ['85073003328', true], // without separators
    ['85.07.30-033.29', false], // wrong check digits
    ['01.02.03-123.45', true], // born 2001: the check uses "2" + 010203123 → 97 - (2010203123 mod 97) = 45
    ['1234', false],
  ])('national number %s → %s', (value, valid) => {
    expect(isValidNationalNumber(value)).toBe(valid);
  });

  it.each([
    ['0403.199.702', true],
    ['0403199702', true],
    ['0403.199.703', false],
    ['2403.199.702', false], // must start with 0 or 1
  ])('company number %s → %s', (value, valid) => {
    expect(isValidCompanyNumber(value)).toBe(valid);
  });

  it.each([
    ['BE68 5390 0754 7034', true],
    ['be68539007547034', true],
    ['BE69 5390 0754 7034', false],
    ['NL91 ABNA 0417 1643 00', false], // valid Dutch IBAN, but not Belgian
  ])('IBAN %s → %s', (value, valid) => {
    expect(isValidBelgianIban(value)).toBe(valid);
  });
});

describe('validators', () => {
  it('leave empty values to Validators.required', () => {
    expect(belgianIbanValidator(new FormControl(''))).toBeNull();
  });

  it('report an invalid IBAN', () => {
    expect(belgianIbanValidator(new FormControl('BE00 0000'))).toEqual({ iban: true });
  });

  it('ageBetween checks the age on a fixed day', () => {
    const today = new Date('2026-10-25T00:00:00Z');
    const adult = ageBetween(18, 100, today);
    expect(adult(new FormControl('2008-10-25'))).toBeNull(); // 18 today
    expect(adult(new FormControl('2008-10-26'))).toEqual({
      age: { min: 18, max: 100, actual: 17 },
    });
    expect(adult(new FormControl('nonsense'))).toEqual({ date: true });
  });

  it('the group validator compares the birth date with the national number', () => {
    const group = new FormGroup(
      {
        birthDate: new FormControl('1985-07-30'),
        nationalNumber: new FormControl('85.07.30-033.28'),
      },
      { validators: birthDateMatchesNationalNumber },
    );
    expect(group.errors).toBeNull();
    group.controls.birthDate.setValue('1985-07-31');
    expect(group.errors).toEqual({ birthDateMismatch: true });
  });
});
