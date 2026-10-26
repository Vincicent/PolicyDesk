// Cloudflare Pages Function: a small SOAP 1.1 service, playing the "legacy policy administration system".
//   GET  /soap/policy?wsdl  → the WSDL (the service contract)
//   POST /soap/policy       → GetPolicyValuation (SOAPAction: "urn:policydesk:GetPolicyValuation")
// Auth: the same Bearer token as the REST API, in the HTTP Authorization header.
import { requireUser } from '../../api-lib/auth';
import { HttpError, round2, type Env } from '../../api-lib/http';

const NS = 'urn:policydesk:valuation';
const SOAP_NS = 'http://schemas.xmlsoap.org/soap/envelope/';

const escapeXml = (s: string) =>
  s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');

const envelope = (body: string) =>
  `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="${SOAP_NS}" xmlns:pd="${NS}">
  <soap:Body>
${body}
  </soap:Body>
</soap:Envelope>`;

const xml = (text: string, status = 200) =>
  new Response(text, { status, headers: { 'content-type': 'text/xml; charset=utf-8', 'cache-control': 'no-store' } });

/** SOAP 1.1 errors are a <soap:Fault> with HTTP 500 (faultcode Client = the caller's fault, Server = ours). */
const fault = (code: 'soap:Client' | 'soap:Server', message: string) =>
  xml(
    envelope(`    <soap:Fault>
      <faultcode>${code}</faultcode>
      <faultstring>${escapeXml(message)}</faultstring>
    </soap:Fault>`),
    500,
  );

/** Workers have no DOMParser: we read the one element we need. Real SOAP stacks (WCF, CXF) parse the full XML. */
const readElement = (body: string, name: string) =>
  new RegExp(`<(?:\\w+:)?${name}>\\s*([^<]*?)\\s*</(?:\\w+:)?${name}>`).exec(body)?.[1] ?? null;

export const onRequestGet: PagesFunction<Env> = async ({ request }) => {
  const url = new URL(request.url);
  if (!url.searchParams.has('wsdl')) return xml('<error>Add ?wsdl to read the service contract</error>', 400);
  return xml(wsdl(`${url.origin}/soap/policy`));
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const action = (request.headers.get('soapaction') ?? '').replaceAll('"', '');
  if (action !== 'urn:policydesk:GetPolicyValuation') {
    return fault('soap:Client', `Unknown SOAPAction "${action}". Use "urn:policydesk:GetPolicyValuation".`);
  }
  let user;
  try {
    user = await requireUser(request, env);
  } catch (err) {
    return fault('soap:Client', err instanceof HttpError ? err.message : 'Unauthorized');
  }
  const body = await request.text();
  const policyNumber = readElement(body, 'PolicyNumber');
  if (!policyNumber) return fault('soap:Client', 'PolicyNumber is required');

  try {
    const policy = await env.DB.prepare(
      `SELECT p.id, p.policy_number, p.status, p.start_date, pr.branch, c.broker_id
       FROM policies p JOIN products pr ON pr.id = p.product_id JOIN clients c ON c.id = p.client_id
       WHERE p.policy_number = ?`,
    )
      .bind(policyNumber.toUpperCase())
      .first<{ id: number; policy_number: string; status: string; start_date: string; branch: number; broker_id: number }>();
    if (!policy || (user.role === 'broker' && policy.broker_id !== user.brokerId)) {
      return fault('soap:Client', `Policy ${policyNumber} not found`);
    }

    let gross = 0;
    let fundsXml = '';
    let valuationDate = new Date().toISOString().slice(0, 10);
    if (policy.status === 'active' && policy.branch === 21) {
      const r = await env.DB.prepare('SELECT reserve FROM b21_yearly WHERE policy_id = ? ORDER BY year DESC LIMIT 1')
        .bind(policy.id)
        .first<{ reserve: number }>();
      gross = r?.reserve ?? 0;
    } else if (policy.status === 'active') {
      const { results } = await env.DB.prepare(
        `SELECT f.isin, f.name, u.units, fp.nav, fp.price_date
         FROM policy_units u JOIN funds f ON f.id = u.fund_id
         JOIN fund_prices fp ON fp.fund_id = u.fund_id AND fp.price_date = (SELECT MAX(price_date) FROM fund_prices WHERE fund_id = u.fund_id)
         WHERE u.policy_id = ? ORDER BY f.risk_class`,
      )
        .bind(policy.id)
        .all<{ isin: string; name: string; units: number; nav: number; price_date: string }>();
      for (const f of results) {
        const value = f.units * f.nav;
        gross += value;
        valuationDate = f.price_date;
        fundsXml += `
        <pd:Fund>
          <pd:Isin>${f.isin}</pd:Isin>
          <pd:Name>${escapeXml(f.name)}</pd:Name>
          <pd:Units>${f.units.toFixed(4)}</pd:Units>
          <pd:Nav>${f.nav.toFixed(4)}</pd:Nav>
          <pd:Value>${round2(value).toFixed(2)}</pd:Value>
        </pd:Fund>`;
      }
    }
    // Simplified surrender fee: branch 21 = 5 % in year 1, minus 1 % per year (0 after 5 years); branch 23 = 0.5 %.
    const years = (Date.now() - Date.parse(policy.start_date)) / (365.25 * 86400000);
    const feeRate = policy.branch === 21 ? Math.max(0, 5 - Math.floor(years)) / 100 : 0.005;
    const surrender = gross * (1 - feeRate);

    return xml(
      envelope(`    <pd:GetPolicyValuationResponse>
      <pd:PolicyNumber>${policy.policy_number}</pd:PolicyNumber>
      <pd:Branch>${policy.branch}</pd:Branch>
      <pd:Status>${policy.status}</pd:Status>
      <pd:ValuationDate>${valuationDate}</pd:ValuationDate>
      <pd:Currency>EUR</pd:Currency>
      <pd:GrossValue>${round2(gross).toFixed(2)}</pd:GrossValue>
      <pd:SurrenderFeeRate>${feeRate.toFixed(4)}</pd:SurrenderFeeRate>
      <pd:SurrenderValue>${round2(surrender).toFixed(2)}</pd:SurrenderValue>
      <pd:Funds>${fundsXml}
      </pd:Funds>
    </pd:GetPolicyValuationResponse>`),
    );
  } catch (err) {
    console.error(err);
    return fault('soap:Server', 'Valuation service error');
  }
};

function wsdl(location: string) {
  return `<?xml version="1.0" encoding="utf-8"?>
<definitions name="PolicyValuation" targetNamespace="${NS}"
  xmlns="http://schemas.xmlsoap.org/wsdl/" xmlns:soap="http://schemas.xmlsoap.org/wsdl/soap/"
  xmlns:pd="${NS}" xmlns:xsd="http://www.w3.org/2001/XMLSchema">
  <types>
    <xsd:schema targetNamespace="${NS}" elementFormDefault="qualified">
      <xsd:element name="GetPolicyValuationRequest">
        <xsd:complexType><xsd:sequence>
          <xsd:element name="PolicyNumber" type="xsd:string"/>
        </xsd:sequence></xsd:complexType>
      </xsd:element>
      <xsd:complexType name="Fund"><xsd:sequence>
        <xsd:element name="Isin" type="xsd:string"/>
        <xsd:element name="Name" type="xsd:string"/>
        <xsd:element name="Units" type="xsd:decimal"/>
        <xsd:element name="Nav" type="xsd:decimal"/>
        <xsd:element name="Value" type="xsd:decimal"/>
      </xsd:sequence></xsd:complexType>
      <xsd:element name="GetPolicyValuationResponse">
        <xsd:complexType><xsd:sequence>
          <xsd:element name="PolicyNumber" type="xsd:string"/>
          <xsd:element name="Branch" type="xsd:int"/>
          <xsd:element name="Status" type="xsd:string"/>
          <xsd:element name="ValuationDate" type="xsd:date"/>
          <xsd:element name="Currency" type="xsd:string"/>
          <xsd:element name="GrossValue" type="xsd:decimal"/>
          <xsd:element name="SurrenderFeeRate" type="xsd:decimal"/>
          <xsd:element name="SurrenderValue" type="xsd:decimal"/>
          <xsd:element name="Funds"><xsd:complexType><xsd:sequence>
            <xsd:element name="Fund" type="pd:Fund" minOccurs="0" maxOccurs="unbounded"/>
          </xsd:sequence></xsd:complexType></xsd:element>
        </xsd:sequence></xsd:complexType>
      </xsd:element>
    </xsd:schema>
  </types>
  <message name="GetPolicyValuationInput"><part name="body" element="pd:GetPolicyValuationRequest"/></message>
  <message name="GetPolicyValuationOutput"><part name="body" element="pd:GetPolicyValuationResponse"/></message>
  <portType name="PolicyValuationPortType">
    <operation name="GetPolicyValuation">
      <input message="pd:GetPolicyValuationInput"/>
      <output message="pd:GetPolicyValuationOutput"/>
    </operation>
  </portType>
  <binding name="PolicyValuationBinding" type="pd:PolicyValuationPortType">
    <soap:binding style="document" transport="http://schemas.xmlsoap.org/soap/http"/>
    <operation name="GetPolicyValuation">
      <soap:operation soapAction="urn:policydesk:GetPolicyValuation"/>
      <input><soap:body use="literal"/></input>
      <output><soap:body use="literal"/></output>
    </operation>
  </binding>
  <service name="PolicyValuationService">
    <port name="PolicyValuationPort" binding="pd:PolicyValuationBinding">
      <soap:address location="${location}"/>
    </port>
  </service>
</definitions>`;
}
