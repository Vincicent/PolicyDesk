import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { Allocation, PolicyRequest, RequestType } from '../../core/models';

export interface RequestInput {
  policyId: number;
  type: RequestType;
  payload: { allocations?: Allocation[]; amount?: number; iban?: string };
}

@Injectable({ providedIn: 'root' })
export class RequestsService {
  private readonly http = inject(HttpClient);

  create(input: RequestInput): Observable<PolicyRequest> {
    return this.http.post<PolicyRequest>('/api/requests', input);
  }
}
