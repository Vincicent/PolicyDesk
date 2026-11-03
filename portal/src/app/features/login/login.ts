import { Component, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { toApiError } from '../../core/api-error';

@Component({
  selector: 'app-login',
  imports: [FormsModule], // standalone components list what their template uses
  templateUrl: './login.html',
})
export class Login {
  readonly returnUrl = input<string>();

  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  // Template-driven form: plain properties + [(ngModel)], like ng-model in AngularJS.
  protected username = 'dupont';
  protected password = '';
  protected readonly error = signal<string | null>(null);
  protected readonly busy = signal(false);

  protected submit(): void {
    this.error.set(null);
    this.busy.set(true);
    this.auth.login(this.username, this.password).subscribe({
      next: ({ user }) => {
        this.busy.set(false);
        if (user.role !== 'broker') {
          this.auth.logout();
          this.error.set(
            'The portal is for brokers. Underwriters use the back-office (/backoffice/).',
          );
          return;
        }
        void this.router.navigateByUrl(safeReturnUrl(this.returnUrl()));
      },
      error: (err: unknown) => {
        this.busy.set(false);
        this.error.set(toApiError(err).message);
      },
    });
  }
}

/**
 * Only follow internal paths. Without this check, a link like /login?returnUrl=https://evil.example
 * would send the user to another site right after they signed in (an "open redirect").
 */
export function safeReturnUrl(url: string | undefined): string {
  return url && url.startsWith('/') && !url.startsWith('//') ? url : '/dashboard';
}
