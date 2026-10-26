// Generates migrations/0002_seed.sql: fictional but realistic demo data (same output every run).
// Run: npm run db:seed   (then npm run db:reset to load it locally)
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';

// ---------- helpers ----------
let seed = 20261023;
const rand = () => {
  // mulberry32: tiny deterministic PRNG
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const pick = (list) => list[Math.floor(rand() * list.length)];
const int = (min, max) => min + Math.floor(rand() * (max - min + 1));
const round2 = (n) => Math.round(n * 100) / 100;
const round4 = (n) => Math.round(n * 10000) / 10000;
const sql = (v) => (v === null || v === undefined ? 'NULL' : typeof v === 'number' ? String(v) : `'${String(v).replaceAll("'", "''")}'`);
const insert = (table, rows) => {
  if (rows.length === 0) return '';
  const cols = Object.keys(rows[0]);
  const values = rows.map((r) => `  (${cols.map((c) => sql(r[c])).join(', ')})`).join(',\n');
  return `INSERT INTO ${table} (${cols.join(', ')}) VALUES\n${values};\n\n`;
};
const iso = (d) => d.toISOString().slice(0, 10);
const addDays = (d, n) => new Date(d.getTime() + n * 86400000);

// ---------- Belgian check digits (same rules as the Angular validators) ----------
const mod97 = (digits) => Number(BigInt(digits) % 97n);
function nationalNumber(birth) {
  // YY.MM.DD-SSS.CC ; CC = 97 - (YYMMDDSSS mod 97) for people born before 2000
  const base = `${birth.slice(2, 4)}${birth.slice(5, 7)}${birth.slice(8, 10)}${String(int(1, 997)).padStart(3, '0')}`;
  const cc = String(97 - mod97(base)).padStart(2, '0');
  return `${base.slice(0, 2)}.${base.slice(2, 4)}.${base.slice(4, 6)}-${base.slice(6, 9)}.${cc}`;
}
function iban() {
  // Belgian account: 10 digits + 2 check digits (first 10 mod 97, 0 → 97), then the IBAN check digits.
  const first10 = String(int(1, 9)) + String(int(0, 999999999)).padStart(9, '0');
  const check = mod97(first10) || 97;
  const bban = first10 + String(check).padStart(2, '0');
  const ibanCheck = 98 - mod97(`${bban}111400`); // "BE00" moved to the end, B=11, E=14
  const raw = `BE${String(ibanCheck).padStart(2, '0')}${bban}`;
  return raw.replace(/(.{4})/g, '$1 ').trim();
}
function companyNumber() {
  // 0XXX.XXX.XXX ; last 2 digits = 97 - (first 8 mod 97)
  const first8 = '0' + String(int(2000000, 9999999)).padStart(7, '0');
  const cc = String(97 - mod97(first8)).padStart(2, '0');
  const d = first8 + cc;
  return `${d.slice(0, 4)}.${d.slice(4, 7)}.${d.slice(7, 10)}`;
}

// ---------- reference data ----------
const TODAY = new Date('2026-10-23T00:00:00Z'); // last NAV date; the data is "as of" this day
const sha256 = (s) => createHash('sha256').update(s).digest('hex');

const brokers = [
  { id: 1, name: 'Dupont & Fils Assurances', fsma_number: '0412.345.614', city: 'Namur' },
  { id: 2, name: 'Janssens Verzekeringen', fsma_number: '0598.765.459', city: 'Leuven' },
];
const users = [
  { id: 1, username: 'dupont', display_name: 'Claire Dupont', role: 'broker', broker_id: 1, password_hash: sha256('demo') },
  { id: 2, username: 'janssens', display_name: 'Pieter Janssens', role: 'broker', broker_id: 2, password_hash: sha256('demo') },
  { id: 3, username: 'martin', display_name: 'Sophie Martin', role: 'underwriter', broker_id: null, password_hash: sha256('demo') },
];
const products = [
  {
    id: 1, code: 'SAFE21', name: 'DemoLife Secure 21', branch: 21, client_type: 'person', guaranteed_rate: 0.015,
    entry_fee_rate: 0.02, management_fee_rate: 0, min_premium: 2500,
    description: 'Branch 21 savings insurance: capital and a yearly guaranteed rate, plus a possible profit share.',
  },
  {
    id: 2, code: 'INVEST23', name: 'DemoLife Invest 23', branch: 23, client_type: 'person', guaranteed_rate: null,
    entry_fee_rate: 0.03, management_fee_rate: 0.012, min_premium: 5000,
    description: 'Branch 23 unit-linked insurance: the value follows the funds you choose. No capital guarantee.',
  },
  {
    id: 3, code: 'CORP21', name: 'DemoLife Corporate 21', branch: 21, client_type: 'company', guaranteed_rate: 0.0125,
    entry_fee_rate: 0.015, management_fee_rate: 0, min_premium: 10000,
    description: 'Branch 21 investment for companies: guaranteed rate on the treasury you place.',
  },
];
const funds = [
  { id: 1, isin: 'BE0DEMO00011', name: 'DemoLife Global Bonds', risk_class: 2, currency: 'EUR', start: 61.2, drift: 0.0004, vol: 0.004 },
  { id: 2, isin: 'BE0DEMO00029', name: 'DemoLife Balanced Mix', risk_class: 3, currency: 'EUR', start: 88.4, drift: 0.0009, vol: 0.009 },
  { id: 3, isin: 'BE0DEMO00037', name: 'DemoLife Sustainable Growth', risk_class: 4, currency: 'EUR', start: 102.7, drift: 0.0012, vol: 0.014 },
  { id: 4, isin: 'BE0DEMO00045', name: 'DemoLife Euro Equity', risk_class: 5, currency: 'EUR', start: 94.1, drift: 0.0015, vol: 0.021 },
];
const TAX = { person: 0.02, company: 0.044 }; // Belgian premium tax (simplified)

// ---------- fund prices: one per week for 2 years, ending TODAY ----------
const fundPrices = [];
const navOn = new Map(); // `${fundId}|${date}` → nav
const weeks = 104;
for (const f of funds) {
  let nav = f.start;
  for (let w = weeks; w >= 0; w--) {
    const date = iso(addDays(TODAY, -7 * w));
    if (w !== weeks) nav = nav * (1 + f.drift + (rand() - 0.5) * 2 * f.vol);
    fundPrices.push({ fund_id: f.id, price_date: date, nav: round4(nav) });
    navOn.set(`${f.id}|${date}`, round4(nav));
  }
}
const priceDates = fundPrices.filter((p) => p.fund_id === 1).map((p) => p.price_date);
const latestDate = priceDates[priceDates.length - 1];
const navAtOrAfter = (fundId, date) => {
  const d = priceDates.find((p) => p >= date) ?? latestDate;
  return navOn.get(`${fundId}|${d}`);
};

// ---------- clients ----------
const firstNames = ['Marie', 'Lucas', 'Emma', 'Noah', 'Louise', 'Arthur', 'Elise', 'Jules', 'Lotte', 'Wout', 'Sofie', 'Thomas',
  'Camille', 'Mathis', 'Anouk', 'Bram', 'Julie', 'Hugo', 'Fien', 'Victor', 'Nora', 'Simon', 'Laura', 'Maxime'];
const lastNames = ['Peeters', 'Janssens', 'Maes', 'Jacobs', 'Mertens', 'Willems', 'Claes', 'Goossens', 'Wouters', 'Dubois',
  'Lambert', 'Dupuis', 'Lejeune', 'Renard', 'Leclercq', 'Hermans', 'Martens', 'Simon', 'Michel', 'Lefebvre', 'Desmet', 'Vermeulen'];
const companies = ['Menuiserie Lambert SRL', 'Peeters Bouw BV', 'Boulangerie Renard SRL', 'Garage Claes BV', 'Studio Lejeune SRL',
  'Vermeulen Logistics NV', 'Cabinet Dubois SRL', 'De Smet Tuinen BV', 'Imprimerie Michel SRL'];
const citiesFr = ['Namur', 'Liège', 'Charleroi', 'Mons', 'Wavre', 'Dinant', 'Bruxelles'];
const citiesNl = ['Leuven', 'Gent', 'Antwerpen', 'Mechelen', 'Hasselt', 'Brugge', 'Brussel'];

const clients = [];
let clientId = 0;
const usedNames = new Set();
function addClient(brokerId, type) {
  const lang = brokerId === 1 ? (rand() < 0.85 ? 'fr' : 'en') : rand() < 0.85 ? 'nl' : 'en';
  const city = pick(brokerId === 1 ? citiesFr : citiesNl);
  const created = addDays(TODAY, -int(30, 3600));
  const base = {
    id: ++clientId, broker_id: brokerId, type, first_name: null, last_name: null, birth_date: null, national_number: null,
    company_name: null, company_number: null, email: '', phone: `+32 4${int(70, 99)} ${int(10, 99)} ${int(10, 99)} ${int(10, 99)}`,
    iban: iban(), city, language: lang, risk_profile: null, created_at: created.toISOString(),
  };
  if (type === 'person') {
    let first, last;
    do { first = pick(firstNames); last = pick(lastNames); } while (usedNames.has(first + last));
    usedNames.add(first + last);
    const birth = `${int(1950, 1995)}-${String(int(1, 12)).padStart(2, '0')}-${String(int(1, 28)).padStart(2, '0')}`;
    Object.assign(base, {
      first_name: first, last_name: last, birth_date: birth, national_number: nationalNumber(birth),
      email: `${first}.${last}@example.be`.toLowerCase(), risk_profile: rand() < 0.85 ? pick(['defensive', 'neutral', 'dynamic']) : null,
    });
  } else {
    const name = companies[clients.filter((c) => c.type === 'company').length % companies.length];
    Object.assign(base, {
      company_name: name, company_number: companyNumber(),
      email: `info@${name.split(' ')[0].toLowerCase()}.example.be`, risk_profile: pick(['defensive', 'neutral']), phone: `+32 ${int(2, 9)}${int(10, 99)} ${int(10, 99)} ${int(10, 99)}`,
    });
  }
  clients.push(base);
}
for (let i = 0; i < 30; i++) addClient(1, 'person');
for (let i = 0; i < 6; i++) addClient(1, 'company');
for (let i = 0; i < 12; i++) addClient(2, 'person');
for (let i = 0; i < 3; i++) addClient(2, 'company');

// ---------- policies ----------
const policies = [];
const b21Yearly = [];
const policyUnits = [];
let policyId = 0;
const numbers = { 21: 1000, 23: 4000 };
function guaranteedRateFor(year, product) {
  if (year < 2016) return 0.02;
  if (year < 2022) return 0.0075;
  return product.guaranteed_rate;
}
function addPolicy(client, product) {
  const id = ++policyId;
  const premium = Math.round((product.min_premium * (1 + rand() * 9)) / 500) * 500;
  const net = premium * (1 - TAX[client.type]) * (1 - product.entry_fee_rate);
  const policyNumber = `B${product.branch}-${String(++numbers[product.branch]).padStart(6, '0')}`;
  if (product.branch === 21) {
    const startYear = int(2012, 2026);
    const start = `${startYear}-${String(int(1, 12)).padStart(2, '0')}-${String(int(1, 28)).padStart(2, '0')}`;
    const startDate = new Date(`${start}T00:00:00Z`);
    const duration = pick([8, 10, 12, null]);
    const end = duration ? `${startYear + duration}${start.slice(4)}` : null;
    // a few contracts mature in the next 90 days (dashboard "maturities")
    const soon = rand() < 0.12 && startDate < addDays(TODAY, -365 * 8);
    const endDate = soon ? iso(addDays(TODAY, int(5, 85))) : end;
    const matured = endDate !== null && endDate < iso(TODAY);
    const rate = guaranteedRateFor(startYear, product);
    let reserve = net;
    for (let y = startYear; y <= 2026; y++) {
      const ps = y === 2026 ? 0 : round4(rand() * 0.006);
      if (y > startYear) reserve = reserve * (1 + rate + ps);
      if (matured && endDate.slice(0, 4) < String(y)) break;
      b21Yearly.push({ policy_id: id, year: y, guaranteed_rate: rate, profit_sharing_rate: ps, reserve: round2(reserve) });
    }
    policies.push({
      id, policy_number: policyNumber, client_id: client.id, product_id: product.id, status: matured ? 'matured' : 'active',
      start_date: start, end_date: endDate, total_premiums: premium,
    });
  } else {
    const start = iso(addDays(TODAY, -int(14, 700)));
    const chosen = client.risk_profile === 'dynamic' ? [3, 4] : client.risk_profile === 'defensive' ? [1, 2] : [1, 2, 3];
    const shares = chosen.length === 2 ? [60, 40] : [40, 35, 25];
    chosen.forEach((fundId, i) => {
      const units = (net * shares[i]) / 100 / navAtOrAfter(fundId, start);
      policyUnits.push({ policy_id: id, fund_id: fundId, units: round4(units) });
    });
    policies.push({
      id, policy_number: policyNumber, client_id: client.id, product_id: product.id, status: 'active',
      start_date: start, end_date: null, total_premiums: premium,
    });
  }
}
for (const c of clients) {
  if (c.type === 'company') {
    addPolicy(c, products[2]);
    continue;
  }
  const r = rand();
  if (r < 0.4) addPolicy(c, products[0]);
  else if (r < 0.75) addPolicy(c, products[1]);
  else {
    addPolicy(c, products[0]);
    addPolicy(c, products[1]);
  }
}
// one surrendered contract, for the status filter
const toSurrender = policies.find((p) => p.product_id === 1 && p.status === 'active');
toSurrender.status = 'surrendered';

// ---------- requests ----------
const requests = [];
const statuses = ['pending', 'pending', 'pending', 'pending', 'in_review', 'in_review', 'approved', 'approved', 'approved', 'rejected', 'pending', 'pending', 'approved', 'pending'];
const activePolicies = policies.filter((p) => p.status === 'active');
statuses.forEach((status, i) => {
  const policy = activePolicies[(i * 7) % activePolicies.length];
  const client = clients.find((c) => c.id === policy.client_id);
  const product = products.find((p) => p.id === policy.product_id);
  let type;
  let payload;
  if (product.branch === 23 && i % 2 === 0) {
    type = 'fund_switch';
    payload = { allocations: [{ fundId: 2, percent: 50 }, { fundId: 3, percent: 50 }] };
  } else if (i % 3 === 0) {
    type = 'partial_surrender';
    payload = { amount: Math.round(policy.total_premiums * 0.2 / 100) * 100, iban: client.iban };
  } else {
    type = 'extra_premium';
    payload = { amount: pick([1000, 2500, 5000]) };
  }
  const decided = status === 'approved' || status === 'rejected';
  const createdAt = new Date(addDays(TODAY, decided ? -int(10, 60) : -int(0, 12)).getTime() + int(8, 17) * 3600000).toISOString();
  requests.push({
    id: i + 1, policy_id: policy.id, type, payload: JSON.stringify(payload), status, created_at: createdAt,
    created_by: client.broker_id === 1 ? 1 : 2, assigned_to: status === 'pending' ? null : 3,
    decided_at: decided ? addDays(new Date(createdAt), 2).toISOString() : null,
    decision_comment: status === 'rejected' ? 'IBAN does not belong to the policyholder. Please send a signed form.' : decided ? 'OK' : null,
  });
});

// ---------- write ----------
const out =
  '-- Generated by db/generate-seed.mjs. Do not edit by hand: change the generator and run `npm run db:seed`.\n' +
  '-- All people, companies, numbers and funds are fictional.\n\n' +
  insert('brokers', brokers) +
  insert('users', users) +
  insert('products', products) +
  insert('funds', funds.map(({ start, drift, vol, ...f }) => f)) +
  insert('fund_prices', fundPrices) +
  insert('clients', clients) +
  insert('policies', policies) +
  insert('b21_yearly', b21Yearly) +
  insert('policy_units', policyUnits) +
  insert('requests', requests);
writeFileSync(new URL('../migrations/0002_seed.sql', import.meta.url), out);
console.log(`Seed written: ${clients.length} clients, ${policies.length} policies, ${fundPrices.length} prices, ${requests.length} requests`);
