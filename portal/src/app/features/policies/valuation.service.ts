import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { catchError, map, Observable, throwError } from 'rxjs';

export interface Valuation {
  policyNumber: string;
  valuationDate: string;
  grossValue: number;
  surrenderFeeRate: number;
  surrenderValue: number;
  funds: { isin: string; name: string; units: number; nav: number; value: number }[];
}

/** A SOAP fault turned into a normal Error, so callers handle it like any other error. */
export class SoapFault extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

const NS = 'urn:policydesk:valuation';

/**
 * Talks to the "legacy" policy system over SOAP 1.1. Angular has no SOAP client: SOAP is just
 * an HTTP POST of an XML envelope, so HttpClient + DOMParser are enough.
 */
@Injectable({ providedIn: 'root' })
export class ValuationService {
  private readonly http = inject(HttpClient);

  getValuation(policyNumber: string): Observable<Valuation> {
    const envelope = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:pd="${NS}">
  <soap:Body>
    <pd:GetPolicyValuationRequest>
      <pd:PolicyNumber>${escapeXml(policyNumber)}</pd:PolicyNumber>
    </pd:GetPolicyValuationRequest>
  </soap:Body>
</soap:Envelope>`;

    return this.http
      .post('/soap/policy', envelope, {
        headers: {
          'Content-Type': 'text/xml; charset=utf-8',
          SOAPAction: '"urn:policydesk:GetPolicyValuation"',
        },
        responseType: 'text', // XML, not JSON
      })
      .pipe(
        map((xml) => parseValuation(xml)),
        // SOAP 1.1 sends faults with HTTP 500: read the <faultstring> from the body.
        catchError((err: unknown) =>
          throwError(() =>
            err instanceof HttpErrorResponse &&
            typeof err.error === 'string' &&
            err.error.includes('Fault')
              ? parseFault(err.error)
              : err,
          ),
        ),
      );
  }
}

function escapeXml(s: string): string {
  return s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

/** getElementsByTagNameNS ignores the prefix (pd:, ns1:…): only the namespace counts. */
function text(parent: Element | Document, name: string): string {
  return parent.getElementsByTagNameNS(NS, name)[0]?.textContent?.trim() ?? '';
}

export function parseValuation(xml: string): Valuation {
  const doc = new DOMParser().parseFromString(xml, 'text/xml');
  if (doc.getElementsByTagName('parsererror').length > 0)
    throw new SoapFault('parse', 'The valuation service sent invalid XML');
  const fault = doc.getElementsByTagNameNS('http://schemas.xmlsoap.org/soap/envelope/', 'Fault')[0];
  if (fault) throw parseFault(xml);
  return {
    policyNumber: text(doc, 'PolicyNumber'),
    valuationDate: text(doc, 'ValuationDate'),
    grossValue: Number(text(doc, 'GrossValue')),
    surrenderFeeRate: Number(text(doc, 'SurrenderFeeRate')),
    surrenderValue: Number(text(doc, 'SurrenderValue')),
    funds: [...doc.getElementsByTagNameNS(NS, 'Fund')].map((f) => ({
      isin: text(f, 'Isin'),
      name: text(f, 'Name'),
      units: Number(text(f, 'Units')),
      nav: Number(text(f, 'Nav')),
      value: Number(text(f, 'Value')),
    })),
  };
}

export function parseFault(xml: string): SoapFault {
  const doc = new DOMParser().parseFromString(xml, 'text/xml');
  // faultcode / faultstring have NO namespace in SOAP 1.1
  const code = doc.getElementsByTagName('faultcode')[0]?.textContent ?? 'soap:Server';
  const message = doc.getElementsByTagName('faultstring')[0]?.textContent ?? 'Unknown SOAP fault';
  return new SoapFault(code, message);
}
