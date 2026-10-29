import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-not-found',
  imports: [RouterLink],
  template: `
    <div class="page">
      <h1>Page not found</h1>
      <p><a routerLink="/dashboard">Back to the dashboard</a></p>
    </div>
  `,
})
export class NotFound {}
