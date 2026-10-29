import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Dashboard } from '../../core/models';

@Injectable({ providedIn: 'root' })
export class DashboardService {
  private readonly http = inject(HttpClient);

  /** Cold Observable: nothing is sent until someone subscribes (here: the async pipe). */
  load(): Observable<Dashboard> {
    return this.http.get<Dashboard>('/api/dashboard');
  }
}
