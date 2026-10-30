import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { Client, ClientDetail, ClientType, Page, RiskProfile } from '../../core/models';

/** What POST/PUT /api/clients expect. */
export interface ClientInput {
  type: ClientType;
  firstName?: string;
  lastName?: string;
  birthDate?: string;
  nationalNumber?: string;
  companyName?: string;
  companyNumber?: string;
  email: string;
  phone: string;
  iban: string;
  city: string;
  language: 'fr' | 'nl' | 'en';
  riskProfile: RiskProfile | null;
}

export interface ClientQuery {
  search: string;
  type: ClientType | '';
  page: number;
  sort: 'name' | 'createdAt';
}

@Injectable({ providedIn: 'root' })
export class ClientsService {
  private readonly http = inject(HttpClient);

  list(query: ClientQuery, pageSize = 10): Observable<Page<Client>> {
    // HttpParams is immutable: each .set() returns a new object.
    let params = new HttpParams().set('page', query.page).set('pageSize', pageSize);
    if (query.search) params = params.set('search', query.search);
    if (query.type) params = params.set('type', query.type);
    if (query.sort === 'createdAt') params = params.set('sort', 'createdAt').set('dir', 'desc');
    return this.http.get<Page<Client>>('/api/clients', { params });
  }

  /** The URL for one client, used by httpResource in ClientDetailPage. */
  url(id: number | string): string {
    return `/api/clients/${id}`;
  }

  get(id: number | string): Observable<ClientDetail> {
    return this.http.get<ClientDetail>(this.url(id));
  }

  create(input: ClientInput): Observable<Client> {
    return this.http.post<Client>('/api/clients', input);
  }

  update(id: number | string, input: ClientInput): Observable<Client> {
    return this.http.put<Client>(this.url(id), input);
  }
}
