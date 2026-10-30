import { Component, computed, input } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { AbstractControl } from '@angular/forms';
import { startWith, switchMap } from 'rxjs';
import { visibleError } from './error-message';

/**
 * <app-field-error [control]="form.controls.contact.controls.email" />
 *
 * Why not just {{ visibleError(control()) }}? Since Angular 22 components are OnPush by default: this one is
 * only re-checked when its INPUT changes or a SIGNAL it reads changes. The control object never changes, only
 * its state (value, touched, errors). So we turn the control's `events` stream into a signal.
 */
@Component({
  selector: 'app-field-error',
  template: `
    @if (message(); as text) {
      <span class="error-text">{{ text }}</span>
    }
  `,
})
export class FieldError {
  readonly control = input.required<AbstractControl>();

  // Any value/status/touched/pristine change of the control → a new value in this signal.
  private readonly changes = toSignal(
    toObservable(this.control).pipe(switchMap((c) => c.events.pipe(startWith(null)))),
  );

  protected readonly message = computed(() => {
    this.changes(); // read it, so `message` is recomputed on every change
    return visibleError(this.control());
  });
}
