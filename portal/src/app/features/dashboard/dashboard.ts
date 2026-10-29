import { AsyncPipe, CurrencyPipe, DatePipe, PercentPipe } from '@angular/common';
import { Component, inject } from '@angular/core';
import { AuthService } from '../../core/auth.service';
import { KpiCard } from '../../shared/kpi-card';
import { RequestTypePipe } from '../../shared/request-type.pipe';
import { StatusBadge } from '../../shared/status-badge';
import { DashboardService } from './dashboard.service';

@Component({
  selector: 'app-dashboard',
  imports: [AsyncPipe, CurrencyPipe, DatePipe, PercentPipe, RequestTypePipe, StatusBadge, KpiCard],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.css',
})
export class Dashboard {
  protected readonly user = inject(AuthService).user;
  protected readonly dashboard$ = inject(DashboardService).load();
}
