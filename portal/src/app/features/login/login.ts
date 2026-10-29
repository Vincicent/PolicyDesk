import { Component, inject, signal } from '@angular/core';
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
        void this.router.navigate(['/dashboard']);
      },
      error: (err: unknown) => {
        this.busy.set(false);
        this.error.set(toApiError(err).message);
      },
    });
  }
}
