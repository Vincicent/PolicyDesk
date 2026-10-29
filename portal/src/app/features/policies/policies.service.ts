import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { Page, Policy } from '../../core/models';

export interface PolicyQuery {
  search: string;
  branch: '' | '21' | '23';
  status: '' | 'active' | 'surrendered' | 'matured';
  page: number;
}

@Injectable({ providedIn: 'root' })
export class PoliciesService {
  private readonly http = inject(HttpClient);

  list(query: PolicyQuery, pageSize = 10): Observable<Page<Policy>> {
    let params = new HttpParams().set('page', query.page).set('pageSize', pageSize);
    if (query.search) params = params.set('search', query.search);
    if (query.branch) params = params.set('branch', query.branch);
    if (query.status) params = params.set('status', query.status);
    return this.http.get<Page<Policy>>('/api/policies', { params });
  }

  url(id: number | string): string {
    return `/api/policies/${id}`;
  }
}
