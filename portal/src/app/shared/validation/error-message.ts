import { AbstractControl, ValidationErrors } from '@angular/forms';

/** One readable message per error key. The first error found wins. */
export function errorMessage(errors: ValidationErrors | null): string | null {
  if (!errors) return null;
  if (errors['server']) return String(errors['server']); // set by us from the API's 400 details
  if (errors['required']) return 'Required';
  if (errors['email']) return 'Not a valid e-mail address';
  if (errors['iban']) return 'Not a valid Belgian IBAN (BE + 14 digits)';
  if (errors['nationalNumber']) return 'Not a valid national number (check digits)';
  if (errors['companyNumber']) return 'Not a valid company number (check digits)';
  if (errors['date']) return 'Not a valid date';
  if (errors['age']) {
    const a = errors['age'] as { min: number; max: number };
    return `Must be between ${a.min} and ${a.max} years old`;
  }
  if (errors['min']) return `At least ${(errors['min'] as { min: number }).min}`;
  if (errors['max']) return `At most ${(errors['max'] as { max: number }).max}`;
  if (errors['pattern']) return 'Wrong format';
  return 'Invalid value';
}

/** The message to show under a field: only once the user has touched it (or tried to submit). */
export function visibleError(control: AbstractControl | null): string | null {
  return control && control.invalid && (control.touched || control.dirty)
    ? errorMessage(control.errors)
    : null;
}
