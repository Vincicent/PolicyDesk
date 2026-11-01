import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { Allocation } from '../../core/models';

export interface QuoteInput {
  clientId: number;
  productCode: string;
  premium: number;
  durationYears: number;
  allocations?: Allocation[];
}

export interface SavedQuote {
  id: number;
  reference: string;
  createdAt: string;
}

@Injectable({ providedIn: 'root' })
export class QuotesService {
  private readonly http = inject(HttpClient);

  save(input: QuoteInput): Observable<SavedQuote> {
    return this.http.post<SavedQuote>('/api/quotes', input);
  }
}
