// LEGACY STYLE (Angular 2–16): what you'll find in many company codebases. It still compiles in Angular 22.
// rewrites it in modern style: see open-requests.ts next to this file.
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  EventEmitter,
  Input,
  NgModule,
  OnDestroy,
  OnInit,
  Output,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Subscription } from 'rxjs';
import { PolicyRequest } from '../core/models';

@Component({
  selector: 'app-open-requests-legacy',
  standalone: false, // declared in an NgModule (the default before Angular 19)
  // Angular 22 made OnPush the default. Old code relied on the old default, now called Eager:
  // `ng update` adds this line to existing components so they keep working the same way.
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <h3>{{ title }}</h3>
    <p *ngIf="loading">Loading…</p>
    <ul *ngIf="!loading">
      <li *ngFor="let r of requests; trackBy: trackById" (click)="selected.emit(r)">
        {{ r.policyNumber }} · {{ r.type }} · {{ r.status }}
      </li>
    </ul>
    <p *ngIf="!loading && requests.length === 0">No open request.</p>
  `,
})
export class OpenRequestsComponent implements OnInit, OnDestroy {
  @Input() title = 'Open requests';
  @Output() selected = new EventEmitter<PolicyRequest>();

  requests: PolicyRequest[] = [];
  loading = true;
  private subscription?: Subscription;

  constructor(
    private http: HttpClient, // constructor injection
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.subscription = this.http
      .get<PolicyRequest[]>('/api/requests?status=open')
      .subscribe((requests) => {
        this.requests = requests;
        this.loading = false;
        // With zone.js (every app before Angular 21), Angular notices the HTTP response and re-renders by
        // itself: old code never has this line. Our app is ZONELESS: a plain property change tells Angular
        // nothing, so the view would stay on "Loading…" forever. Signals (or this call) fix it.
        this.cdr.markForCheck();
      });
  }

  ngOnDestroy(): void {
    this.subscription?.unsubscribe(); // forget this and the subscription leaks
  }

  trackById(_index: number, r: PolicyRequest): number {
    return r.id;
  }
}

@NgModule({
  declarations: [OpenRequestsComponent],
  imports: [CommonModule],
  exports: [OpenRequestsComponent],
})
export class LegacyRequestsModule {}
