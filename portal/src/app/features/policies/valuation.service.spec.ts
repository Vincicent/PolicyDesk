import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { SoapFault, Valuation, ValuationService } from './valuation.service';

const OK = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ns1="urn:policydesk:valuation">
  <soap:Body>
    <ns1:GetPolicyValuationResponse>
      <ns1:PolicyNumber>B23-004001</ns1:PolicyNumber>
      <ns1:Branch>23</ns1:Branch>
      <ns1:ValuationDate>2026-10-23</ns1:ValuationDate>
      <ns1:GrossValue>1000.00</ns1:GrossValue>
      <ns1:SurrenderFeeRate>0.0050</ns1:SurrenderFeeRate>
      <ns1:SurrenderValue>995.00</ns1:SurrenderValue>
      <ns1:Funds>
        <ns1:Fund><ns1:Isin>BE0DEMO00011</ns1:Isin><ns1:Name>Bonds</ns1:Name><ns1:Units>10</ns1:Units><ns1:Nav>100</ns1:Nav><ns1:Value>1000.00</ns1:Value></ns1:Fund>
      </ns1:Funds>
    </ns1:GetPolicyValuationResponse>
  </soap:Body>
</soap:Envelope>`;

const FAULT = `<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body>
  <soap:Fault><faultcode>soap:Client</faultcode><faultstring>Policy B99 not found</faultstring></soap:Fault>
</soap:Body></soap:Envelope>`;

describe('ValuationService', () => {
  let service: ValuationService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(ValuationService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('posts a SOAP envelope with the SOAPAction header', async () => {
    const result = firstValueFrom(service.getValuation('B23-004001'));
    const req = http.expectOne('/soap/policy');
    expect(req.request.method).toBe('POST');
    expect(req.request.headers.get('SOAPAction')).toBe('"urn:policydesk:GetPolicyValuation"');
    expect(req.request.body).toContain('<pd:PolicyNumber>B23-004001</pd:PolicyNumber>');
    req.flush(OK);

    const valuation: Valuation = await result;
    // the response uses another prefix (ns1:): parsing by namespace still works
    expect(valuation).toMatchObject({
      policyNumber: 'B23-004001',
      grossValue: 1000,
      surrenderValue: 995,
    });
    expect(valuation.funds[0]).toMatchObject({ isin: 'BE0DEMO00011', units: 10 });
  });

  it('turns a SOAP fault (HTTP 500) into a SoapFault with the server message', async () => {
    const result = firstValueFrom(service.getValuation('B99'));
    http
      .expectOne('/soap/policy')
      .flush(FAULT, { status: 500, statusText: 'Internal Server Error' });

    await expect(result).rejects.toEqual(new SoapFault('soap:Client', 'Policy B99 not found'));
    await expect(result).rejects.toBeInstanceOf(SoapFault);
  });
});
