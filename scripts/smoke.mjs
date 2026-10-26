// End-to-end check of the API kit against a running server.
// Run `npm run api` in one terminal, then `npm run smoke` in another (after `npm run db:reset` for a clean state).
// Against your deployed site: BASE=https://policydesk.pages.dev npm run smoke
import assert from 'node:assert/strict';
import { test } from 'node:test';

const BASE = process.env.BASE ?? 'http://localhost:8788';

async function call(method, path, { token, body, headers } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      ...(body !== undefined && typeof body !== 'string' && { 'content-type': 'application/json' }),
      ...(token && { authorization: `Bearer ${token}` }),
      ...headers,
    },
    body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
  });
  const text = await res.text();
  let data = text;
  try {
    data = JSON.parse(text);
  } catch {
    /* XML or text */
  }
  return { status: res.status, data };
}
const login = async (username) => (await call('POST', '/api/login', { body: { username, password: 'demo' } })).data.token;

let broker, broker2, underwriter;

test('login', async () => {
  const bad = await call('POST', '/api/login', { body: { username: 'dupont', password: 'nope' } });
  assert.equal(bad.status, 401);
  assert.equal(bad.data.error.code, 'invalid_credentials');
  const ok = await call('POST', '/api/login', { body: { username: 'Dupont', password: 'demo' } });
  assert.equal(ok.status, 200);
  assert.equal(ok.data.user.role, 'broker');
  assert.equal(ok.data.token.split('.').length, 3);
  broker = ok.data.token;
  broker2 = await login('janssens');
  underwriter = await login('martin');
});

test('auth is required and checked', async () => {
  assert.equal((await call('GET', '/api/clients')).status, 401);
  assert.equal((await call('GET', '/api/clients', { token: broker.slice(0, -2) + 'xx' })).status, 401);
  assert.equal((await call('GET', '/api/clients', { token: 'broken.token.value' })).status, 401); // not base64: still 401
  const me = await call('GET', '/api/me', { token: underwriter });
  assert.equal(me.data.username, 'martin');
  assert.equal((await call('GET', '/api/dashboard', { token: underwriter })).status, 403);
});

test('unknown routes and methods', async () => {
  assert.equal((await call('GET', '/api/nope', { token: broker })).status, 404);
  assert.equal((await call('DELETE', '/api/clients', { token: broker })).status, 405);
});

test('dashboard', async () => {
  const { status, data } = await call('GET', '/api/dashboard', { token: broker });
  assert.equal(status, 200);
  assert.ok(data.clients >= 36); // 36 in the seed, more after creating clients
  assert.ok(data.assetsUnderManagement > 100000);
  assert.equal(
    Math.round((data.reservesByBranch.branch21 + data.reservesByBranch.branch23) * 100),
    Math.round(data.assetsUnderManagement * 100),
  );
  assert.ok(data.recentRequests.length <= 5);
});

test('clients: paging, search, scoping', async () => {
  const p1 = await call('GET', '/api/clients?pageSize=10', { token: broker });
  assert.ok(p1.data.total >= 36);
  assert.equal(p1.data.items.length, 10);
  const lastPage = Math.ceil(p1.data.total / 10);
  const pLast = await call('GET', `/api/clients?pageSize=10&page=${lastPage}`, { token: broker });
  assert.equal(pLast.data.items.length, p1.data.total - (lastPage - 1) * 10);
  const companies = await call('GET', '/api/clients?type=company', { token: broker });
  assert.ok(companies.data.total >= 6 && companies.data.items.every((c) => c.type === 'company'));
  const first = p1.data.items[0];
  const search = await call('GET', `/api/clients?search=${encodeURIComponent(first.displayName.slice(0, 4))}`, { token: broker });
  assert.ok(search.data.items.some((c) => c.id === first.id));
  assert.equal((await call('GET', '/api/clients?pageSize=500', { token: broker })).status, 400);
  // the other broker can't read this client
  assert.equal((await call('GET', `/api/clients/${first.id}`, { token: broker2 })).status, 404);
  const detail = await call('GET', `/api/clients/${first.id}`, { token: broker });
  assert.ok(Array.isArray(detail.data.policies));
});

test('clients: create and update with validation', async () => {
  const bad = await call('POST', '/api/clients', {
    token: broker,
    body: { type: 'person', firstName: 'Ann', lastName: '', birthDate: '1990-02-30x', nationalNumber: '90.02.01-123.45', email: 'x', iban: 'BE00', city: '', language: 'de' },
  });
  assert.equal(bad.status, 400);
  for (const f of ['lastName', 'birthDate', 'nationalNumber', 'email', 'iban', 'city', 'language']) assert.ok(bad.data.error.details[f], f);
  // a valid national number with a random serial, so the test can run many times
  const serial = String(1 + Math.floor(Math.random() * 997)).padStart(3, '0');
  const cc = String(97 - Number(BigInt(`900201${serial}`) % 97n)).padStart(2, '0');
  const body = {
    type: 'person', firstName: 'Ann', lastName: 'Test', birthDate: '1990-02-01', nationalNumber: `90.02.01-${serial}.${cc}`,
    email: 'ann.test@example.be', iban: 'BE68 5390 0754 7034', city: 'Namur', language: 'fr', riskProfile: 'neutral',
  };
  const created = await call('POST', '/api/clients', { token: broker, body });
  assert.equal(created.status, 201, JSON.stringify(created.data));
  assert.equal(created.data.displayName, 'Ann Test');
  const dup = await call('POST', '/api/clients', { token: broker, body });
  assert.equal(dup.status, 409);
  const updated = await call('PUT', `/api/clients/${created.data.id}`, { token: broker, body: { ...body, city: 'Wavre' } });
  assert.equal(updated.data.city, 'Wavre');
  const typeChange = await call('PUT', `/api/clients/${created.data.id}`, { token: broker, body: { ...body, type: 'company', companyName: 'X', companyNumber: '0403.199.702' } });
  assert.equal(typeChange.status, 400);
});

test('policies: filters and details for both branches', async () => {
  const b21 = await call('GET', '/api/policies?branch=21&pageSize=50', { token: broker });
  assert.ok(b21.data.items.every((p) => p.branch === 21));
  const b23 = await call('GET', '/api/policies?branch=23&status=active', { token: broker });
  assert.ok(b23.data.items.every((p) => p.branch === 23 && p.status === 'active'));
  const d21 = await call('GET', `/api/policies/${b21.data.items[0].id}`, { token: broker });
  assert.ok(d21.data.branch21.history.length >= 1);
  assert.equal(d21.data.branch23, null);
  const d23 = await call('GET', `/api/policies/${b23.data.items[0].id}`, { token: broker });
  const shares = d23.data.branch23.funds.reduce((s, f) => s + f.share, 0);
  assert.ok(Math.abs(shares - 100) < 0.5, `shares ${shares}`);
  assert.equal((await call('GET', `/api/policies/${b23.data.items[0].id}`, { token: broker2 })).status, 404);
});

test('products and funds', async () => {
  const persons = await call('GET', '/api/products?clientType=person', { token: broker });
  assert.deepEqual(persons.data.map((p) => p.code), ['SAFE21', 'INVEST23']);
  const funds = await call('GET', '/api/funds', { token: broker });
  assert.equal(funds.data.length, 4);
  const prices = await call('GET', `/api/funds/${funds.data[0].id}/prices?from=2026-01-01`, { token: broker });
  assert.ok(prices.data.length > 30 && prices.data.every((p) => p.date >= '2026-01-01'));
});

test('requests: create, claim, approve (fund switch) and reject', async () => {
  const policies = await call('GET', '/api/policies?branch=23&status=active&pageSize=50', { token: broker });
  const policy = policies.data.items.find((p) => p.currentValue > 0);
  // invalid allocations
  const bad = await call('POST', '/api/requests', {
    token: broker, body: { policyId: policy.id, type: 'fund_switch', payload: { allocations: [{ fundId: 1, percent: 60 }, { fundId: 2, percent: 30 }] } },
  });
  assert.equal(bad.status, 400);
  assert.match(bad.data.error.details.allocations, /90/);
  // close any open fund switch on that policy first (seed data may have one)
  const open = (await call('GET', '/api/requests?status=open', { token: underwriter })).data.filter((r) => r.policyId === policy.id && r.type === 'fund_switch');
  for (const r of open) await call('POST', `/api/requests/${r.id}/decision`, { token: underwriter, body: { decision: 'reject', comment: 'cleanup for test' } });

  const created = await call('POST', '/api/requests', {
    token: broker, body: { policyId: policy.id, type: 'fund_switch', payload: { allocations: [{ fundId: 1, percent: 70 }, { fundId: 4, percent: 30 }] } },
  });
  assert.equal(created.status, 201, JSON.stringify(created.data));
  const again = await call('POST', '/api/requests', {
    token: broker, body: { policyId: policy.id, type: 'fund_switch', payload: { allocations: [{ fundId: 1, percent: 100 }] } },
  });
  assert.equal(again.status, 409);
  assert.equal((await call('POST', `/api/requests/${created.data.id}/claim`, { token: broker })).status, 403);
  const claimed = await call('POST', `/api/requests/${created.data.id}/claim`, { token: underwriter });
  assert.equal(claimed.data.status, 'in_review');
  assert.equal(claimed.data.assignedToName, 'Sophie Martin');
  const before = (await call('GET', `/api/policies/${policy.id}`, { token: broker })).data.currentValue;
  const approved = await call('POST', `/api/requests/${created.data.id}/decision`, { token: underwriter, body: { decision: 'approve' } });
  assert.equal(approved.data.status, 'approved');
  const after = (await call('GET', `/api/policies/${policy.id}`, { token: broker })).data;
  assert.ok(Math.abs(after.currentValue - before) < 0.05, `value kept: ${before} → ${after.currentValue}`);
  assert.deepEqual(after.branch23.funds.map((f) => [f.fundId, Math.round(f.share)]), [[1, 70], [4, 30]]);
  assert.equal((await call('POST', `/api/requests/${created.data.id}/decision`, { token: underwriter, body: { decision: 'approve' } })).status, 409);

  // partial surrender: too high, then valid, then rejected without/with comment
  const tooHigh = await call('POST', '/api/requests', {
    token: broker, body: { policyId: policy.id, type: 'partial_surrender', payload: { amount: after.currentValue + 1, iban: 'BE68 5390 0754 7034' } },
  });
  assert.equal(tooHigh.status, 400);
  const openSurrender = (await call('GET', '/api/requests?status=open', { token: underwriter })).data.filter((r) => r.policyId === policy.id && r.type === 'partial_surrender');
  for (const r of openSurrender) await call('POST', `/api/requests/${r.id}/decision`, { token: underwriter, body: { decision: 'reject', comment: 'cleanup for test' } });
  const surrender = await call('POST', '/api/requests', {
    token: broker, body: { policyId: policy.id, type: 'partial_surrender', payload: { amount: 100, iban: 'BE68 5390 0754 7034' } },
  });
  assert.equal(surrender.status, 201, JSON.stringify(surrender.data));
  assert.equal((await call('POST', `/api/requests/${surrender.data.id}/decision`, { token: underwriter, body: { decision: 'reject' } })).status, 400);
  const rejected = await call('POST', `/api/requests/${surrender.data.id}/decision`, { token: underwriter, body: { decision: 'reject', comment: 'Signed form missing' } });
  assert.equal(rejected.data.status, 'rejected');
  assert.equal(rejected.data.decisionComment, 'Signed form missing');
});

test('requests: approving an extra premium on branch 21 raises the reserve', async () => {
  const policies = await call('GET', '/api/policies?branch=21&status=active&pageSize=50', { token: broker });
  const openList = (await call('GET', '/api/requests?status=open', { token: underwriter })).data;
  const policy = policies.data.items.find((p) => !openList.some((r) => r.policyId === p.id && r.type === 'extra_premium'));
  const created = await call('POST', '/api/requests', { token: broker, body: { policyId: policy.id, type: 'extra_premium', payload: { amount: 1000 } } });
  assert.equal(created.status, 201, JSON.stringify(created.data));
  await call('POST', `/api/requests/${created.data.id}/decision`, { token: underwriter, body: { decision: 'approve' } });
  const after = (await call('GET', `/api/policies/${policy.id}`, { token: broker })).data;
  // 1000 − 2 % premium tax − 2 % entry fee = 960.40
  assert.ok(Math.abs(after.currentValue - policy.currentValue - 960.4) < 0.02, `${policy.currentValue} → ${after.currentValue}`);
  assert.equal(after.totalPremiums, policy.totalPremiums + 1000);
});

test('quotes', async () => {
  const clients = (await call('GET', '/api/clients?type=person', { token: broker })).data.items;
  const bad = await call('POST', '/api/quotes', { token: broker, body: { clientId: clients[0].id, productCode: 'CORP21', premium: 20000, durationYears: 8 } });
  assert.equal(bad.status, 400);
  const ok = await call('POST', '/api/quotes', {
    token: broker, body: { clientId: clients[0].id, productCode: 'INVEST23', premium: 20000, durationYears: 10, allocations: [{ fundId: 2, percent: 100 }] },
  });
  assert.equal(ok.status, 201, JSON.stringify(ok.data));
  assert.match(ok.data.reference, /^Q-\d{4}-\d{6}$/);
  const list = await call('GET', '/api/quotes', { token: broker });
  assert.ok(list.data.some((q) => q.id === ok.data.id));
});

test('SOAP: WSDL, valuation and faults', async () => {
  const wsdl = await call('GET', '/soap/policy?wsdl');
  assert.equal(wsdl.status, 200);
  assert.match(wsdl.data, /<definitions name="PolicyValuation"/);
  const b23 = (await call('GET', '/api/policies?branch=23&status=active', { token: broker })).data.items[0];
  const envelope = (n) => `<?xml version="1.0"?><soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:pd="urn:policydesk:valuation">
    <soap:Body><pd:GetPolicyValuationRequest><pd:PolicyNumber>${n}</pd:PolicyNumber></pd:GetPolicyValuationRequest></soap:Body></soap:Envelope>`;
  const headers = { 'content-type': 'text/xml', soapaction: '"urn:policydesk:GetPolicyValuation"' };
  const ok = await call('POST', '/soap/policy', { token: broker, headers, body: envelope(b23.policyNumber) });
  assert.equal(ok.status, 200);
  const gross = Number(/<pd:GrossValue>([\d.]+)</.exec(ok.data)[1]);
  assert.ok(Math.abs(gross - b23.currentValue) < 0.05, `${gross} vs ${b23.currentValue}`);
  assert.match(ok.data, /<pd:Fund>/);
  const other = await call('POST', '/soap/policy', { token: broker2, headers, body: envelope(b23.policyNumber) });
  assert.equal(other.status, 500);
  assert.match(other.data, /<faultcode>soap:Client<\/faultcode>/);
  const noAction = await call('POST', '/soap/policy', { token: broker, headers: { 'content-type': 'text/xml' }, body: envelope(b23.policyNumber) });
  assert.match(noAction.data, /Unknown SOAPAction/);
  const noAuth = await call('POST', '/soap/policy', { headers, body: envelope(b23.policyNumber) });
  assert.match(noAuth.data, /Sign in first/);
});
