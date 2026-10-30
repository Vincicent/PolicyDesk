import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { FieldError } from './field-error';

@Component({
  imports: [ReactiveFormsModule, FieldError],
  template: `<input [formControl]="email" /><app-field-error [control]="email" />`,
})
class Host {
  readonly email = new FormControl('', [Validators.required, Validators.email]);
}

describe('FieldError', () => {
  it('appears once touched, changes with the value, and disappears when valid', async () => {
    const fixture = TestBed.createComponent(Host);
    const el = fixture.nativeElement as HTMLElement;
    await fixture.whenStable();
    expect(el.querySelector('.error-text')).toBeNull(); // untouched: no error yet

    fixture.componentInstance.email.markAsTouched(); // e.g. markAllAsTouched() on submit
    await fixture.whenStable();
    expect(el.querySelector('.error-text')?.textContent).toBe('Required');

    const input = el.querySelector('input')!;
    input.value = 'not-an-email';
    input.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    expect(el.querySelector('.error-text')?.textContent).toBe('Not a valid e-mail address');

    input.value = 'ann@example.be';
    input.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    expect(el.querySelector('.error-text')).toBeNull();
  });
});
