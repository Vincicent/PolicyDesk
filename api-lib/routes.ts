// Every REST endpoint of PolicyDesk. The contract is in API.md.
import { requireRole, requireUser, sha256Hex, signToken, toUser, type User } from './auth';
import { isValidBelgianIban, isValidCompanyNumber, isValidNationalNumber, PREMIUM_TAX } from './belgium';
import { badRequest, HttpError, intParam, json, notFound, nowIso, readJson, round2 } from './http';
import { Router, type Ctx } from './router';

// ---------- shared SQL ----------
/** Current value of policy `p`: latest branch 21 reserve, or units × latest NAV for branch 23. 0 when closed. */
const VALUE_SQL = `
  CASE WHEN p.status <> 'active' THEN 0
       WHEN pr.branch = 21 THEN COALESCE((SELECT y.reserve FROM b21_yearly y WHERE y.policy_id = p.id ORDER BY y.year DESC LIMIT 1), 0)
       ELSE COALESCE((SELECT SUM(u.units * fp.nav) FROM policy_units u
                      JOIN fund_prices fp ON fp.fund_id = u.fund_id
                       AND fp.price_date = (SELECT MAX(price_date) FROM fund_prices WHERE fund_id = u.fund_id)
                      WHERE u.policy_id = p.id), 0)
  END`;
const CLIENT_NAME_SQL = `COALESCE(c.company_name, c.first_name || ' ' || c.last_name)`;

/** Brokers only see their own clients; underwriters see everyone. Returns [sql, params]. */
function scope(user: User, alias = 'c'): [string, unknown[]] {
  return user.role === 'broker' ? [`${alias}.broker_id = ?`, [user.brokerId]] : ['1 = 1', []];
}

const page = (url: URL) => {
  const p = intParam(url, 'page', 1, 1, 10_000);
  const size = intParam(url, 'pageSize', 10, 1, 50);
  return { page: p, pageSize: size, offset: (p - 1) * size };
};

// ---------- mappers (snake_case rows → camelCase JSON) ----------
interface ClientRow {
  id: number;
  broker_id: number;
  type: 'person' | 'company';
  first_name: string | null;
  last_name: string | null;
  birth_date: string | null;
  national_number: string | null;
  company_name: string | null;
  company_number: string | null;
  display_name: string;
  email: string;
  phone: string | null;
  iban: string;
  city: string;
  language: string;
  risk_profile: string | null;
  created_at: string;
  policy_count?: number;
  total_value?: number;
}
const toClient = (r: ClientRow) => ({
  id: r.id,
  brokerId: r.broker_id,
  type: r.type,
  displayName: r.display_name,
  firstName: r.first_name,
  lastName: r.last_name,
  birthDate: r.birth_date,
  nationalNumber: r.national_number,
  companyName: r.company_name,
  companyNumber: r.company_number,
  email: r.email,
  phone: r.phone,
  iban: r.iban,
  city: r.city,
  language: r.language,
  riskProfile: r.risk_profile,
  createdAt: r.created_at,
  ...(r.policy_count !== undefined && { policyCount: r.policy_count, totalValue: round2(r.total_value ?? 0) }),
});

interface PolicyRow {
  id: number;
  policy_number: string;
  client_id: number;
  client_name: string;
  client_type: 'person' | 'company';
  product_id: number;
  product_code: string;
  product_name: string;
  branch: 21 | 23;
  status: string;
  start_date: string;
  end_date: string | null;
  total_premiums: number;
  current_value: number;
}
const toPolicy = (r: PolicyRow) => ({
  id: r.id,
  policyNumber: r.policy_number,
  clientId: r.client_id,
  clientName: r.client_name,
  productCode: r.product_code,
  productName: r.product_name,
  branch: r.branch,
  status: r.status,
  startDate: r.start_date,
  endDate: r.end_date,
  totalPremiums: r.total_premiums,
  currentValue: round2(r.current_value),
});
const POLICY_SELECT = `
  SELECT p.id, p.policy_number, p.client_id, ${CLIENT_NAME_SQL} AS client_name, c.type AS client_type,
         p.product_id, pr.code AS product_code, pr.name AS product_name, pr.branch,
         p.status, p.start_date, p.end_date, p.total_premiums, ${VALUE_SQL} AS current_value
  FROM policies p
  JOIN clients c ON c.id = p.client_id
  JOIN products pr ON pr.id = p.product_id`;

interface RequestRow {
  id: number;
  policy_id: number;
  policy_number: string;
  branch: 21 | 23;
  client_id: number;
  client_name: string;
  broker_name: string;
  type: string;
  payload: string;
  status: string;
  created_at: string;
  created_by_name: string;
  assigned_to_name: string | null;
  decided_at: string | null;
  decision_comment: string | null;
}
const toRequest = (r: RequestRow) => ({
  id: r.id,
  policyId: r.policy_id,
  policyNumber: r.policy_number,
  branch: r.branch,
  clientId: r.client_id,
  clientName: r.client_name,
  brokerName: r.broker_name,
  type: r.type,
  payload: JSON.parse(r.payload) as unknown,
  status: r.status,
  createdAt: r.created_at,
  createdByName: r.created_by_name,
  assignedToName: r.assigned_to_name,
  decidedAt: r.decided_at,
  decisionComment: r.decision_comment,
});
const REQUEST_SELECT = `
  SELECT r.id, r.policy_id, p.policy_number, pr.branch, c.id AS client_id, ${CLIENT_NAME_SQL} AS client_name,
         b.name AS broker_name, r.type, r.payload, r.status, r.created_at,
         cu.display_name AS created_by_name, au.display_name AS assigned_to_name, r.decided_at, r.decision_comment
  FROM requests r
  JOIN policies p ON p.id = r.policy_id
  JOIN products pr ON pr.id = p.product_id
  JOIN clients c ON c.id = p.client_id
  JOIN brokers b ON b.id = c.broker_id
  JOIN users cu ON cu.id = r.created_by
  LEFT JOIN users au ON au.id = r.assigned_to`;

// ---------- data access ----------
async function findPolicy(ctx: Ctx, user: User, id: number) {
  const [where, params] = scope(user);
  const row = await ctx.env.DB.prepare(`${POLICY_SELECT} WHERE p.id = ? AND ${where}`)
    .bind(id, ...params)
    .first<PolicyRow>();
  if (!row) throw notFound('Policy');
  return row;
}

async function latestNavs(ctx: Ctx) {
  const { results } = await ctx.env.DB.prepare(
    `SELECT f.id, f.isin, f.name, f.risk_class, f.currency, fp.nav, fp.price_date,
            (SELECT nav FROM fund_prices o WHERE o.fund_id = f.id AND o.price_date <= date(fp.price_date, '-1 year')
             ORDER BY o.price_date DESC LIMIT 1) AS nav_1y
     FROM funds f
     JOIN fund_prices fp ON fp.fund_id = f.id AND fp.price_date = (SELECT MAX(price_date) FROM fund_prices WHERE fund_id = f.id)
     ORDER BY f.risk_class`,
  ).all<{ id: number; isin: string; name: string; risk_class: number; currency: string; nav: number; price_date: string; nav_1y: number | null }>();
  return results;
}

async function holdings(ctx: Ctx, policyId: number) {
  const navs = await latestNavs(ctx);
  const { results } = await ctx.env.DB.prepare('SELECT fund_id, units FROM policy_units WHERE policy_id = ?')
    .bind(policyId)
    .all<{ fund_id: number; units: number }>();
  const rows = results.map((u) => {
    const f = navs.find((n) => n.id === u.fund_id)!;
    return { fundId: f.id, isin: f.isin, name: f.name, riskClass: f.risk_class, units: u.units, nav: f.nav, navDate: f.price_date, value: u.units * f.nav };
  });
  const total = rows.reduce((s, r) => s + r.value, 0);
  return rows.map((r) => ({ ...r, value: round2(r.value), share: total > 0 ? Math.round((r.value / total) * 1000) / 10 : 0 }));
}

// ---------- validation ----------
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

function validateClient(body: Record<string, unknown>) {
  const errors: Record<string, string> = {};
  const type = body['type'];
  if (type !== 'person' && type !== 'company') errors['type'] = 'Choose person or company';
  const out = {
    type: type as 'person' | 'company',
    first_name: null as string | null,
    last_name: null as string | null,
    birth_date: null as string | null,
    national_number: null as string | null,
    company_name: null as string | null,
    company_number: null as string | null,
    email: str(body['email']),
    phone: str(body['phone']) || null,
    iban: str(body['iban']).toUpperCase(),
    city: str(body['city']),
    language: str(body['language']),
    risk_profile: (str(body['riskProfile']) || null) as string | null,
  };
  if (type === 'person') {
    out.first_name = str(body['firstName']);
    out.last_name = str(body['lastName']);
    out.birth_date = str(body['birthDate']);
    out.national_number = str(body['nationalNumber']);
    if (!out.first_name) errors['firstName'] = 'Required';
    if (!out.last_name) errors['lastName'] = 'Required';
    if (!ISO_DATE.test(out.birth_date) || Number.isNaN(Date.parse(out.birth_date))) errors['birthDate'] = 'Use YYYY-MM-DD';
    else {
      const age = (Date.now() - Date.parse(out.birth_date)) / (365.25 * 86400000);
      if (age < 18 || age > 100) errors['birthDate'] = 'The client must be between 18 and 100 years old';
    }
    if (!isValidNationalNumber(out.national_number)) errors['nationalNumber'] = 'Not a valid Belgian national number';
  } else if (type === 'company') {
    out.company_name = str(body['companyName']);
    out.company_number = str(body['companyNumber']);
    if (!out.company_name) errors['companyName'] = 'Required';
    if (!isValidCompanyNumber(out.company_number)) errors['companyNumber'] = 'Not a valid Belgian company number';
  }
  if (!EMAIL.test(out.email)) errors['email'] = 'Not a valid e-mail address';
  if (!isValidBelgianIban(out.iban)) errors['iban'] = 'Not a valid Belgian IBAN';
  if (!out.city) errors['city'] = 'Required';
  if (!['fr', 'nl', 'en'].includes(out.language)) errors['language'] = 'Choose fr, nl or en';
  if (out.risk_profile !== null && !['defensive', 'neutral', 'dynamic'].includes(out.risk_profile)) {
    errors['riskProfile'] = 'Choose defensive, neutral or dynamic';
  }
  if (Object.keys(errors).length > 0) throw badRequest('Some fields are invalid', errors);
  return out;
}

function validateAllocations(value: unknown, fundIds: number[]) {
  if (!Array.isArray(value) || value.length === 0 || value.length > 4) {
    throw badRequest('Choose 1 to 4 funds', { allocations: 'Choose 1 to 4 funds' });
  }
  const seen = new Set<number>();
  let total = 0;
  const out = value.map((a: { fundId?: unknown; percent?: unknown }) => {
    const fundId = Number(a?.fundId);
    const percent = Number(a?.percent);
    if (!fundIds.includes(fundId)) throw badRequest('Unknown fund', { allocations: `Unknown fund ${String(a?.fundId)}` });
    if (seen.has(fundId)) throw badRequest('Each fund only once', { allocations: 'Each fund only once' });
    if (!Number.isInteger(percent) || percent < 1 || percent > 100) {
      throw badRequest('Percentages are whole numbers from 1 to 100', { allocations: 'Percentages are whole numbers from 1 to 100' });
    }
    seen.add(fundId);
    total += percent;
    return { fundId, percent };
  });
  if (total !== 100) throw badRequest('The percentages must add up to 100', { allocations: `Total is ${total} %, not 100 %` });
  return out;
}

const amountOf = (v: unknown, field = 'amount') => {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) throw badRequest('Enter a positive amount', { [field]: 'Enter a positive amount' });
  return round2(n);
};

// ---------- routes ----------
export const router = new Router()
  .on('GET', '/health', async () => json({ ok: true, time: nowIso() }))

  // --- auth ---
  .on('POST', '/login', async (ctx) => {
    const body = await readJson(ctx.request);
    const username = str(body['username']).toLowerCase();
    const hash = await sha256Hex(str(body['password']));
    const row = await ctx.env.DB.prepare(
      'SELECT id, username, display_name, role, broker_id FROM users WHERE username = ? AND password_hash = ?',
    )
      .bind(username, hash)
      .first<Parameters<typeof toUser>[0]>();
    if (!row) throw new HttpError(401, 'invalid_credentials', 'Wrong username or password');
    const user = toUser(row);
    return json({ token: await signToken(user, ctx.env.TOKEN_SECRET), user });
  })
  .on('GET', '/me', async (ctx) => json(await requireUser(ctx.request, ctx.env)))

  // --- dashboard (broker) ---
  .on('GET', '/dashboard', async (ctx) => {
    const user = await requireUser(ctx.request, ctx.env);
    requireRole(user, 'broker');
    const db = ctx.env.DB;
    const totals = await db
      .prepare(
        `SELECT COUNT(DISTINCT c.id) AS clients,
                SUM(CASE WHEN p.status = 'active' THEN 1 ELSE 0 END) AS active_policies,
                SUM(CASE WHEN pr.branch = 21 THEN ${VALUE_SQL} ELSE 0 END) AS b21,
                SUM(CASE WHEN pr.branch = 23 THEN ${VALUE_SQL} ELSE 0 END) AS b23
         FROM clients c
         LEFT JOIN policies p ON p.client_id = c.id
         LEFT JOIN products pr ON pr.id = p.product_id
         WHERE c.broker_id = ?`,
      )
      .bind(user.brokerId)
      .first<{ clients: number; active_policies: number; b21: number; b23: number }>();
    const { results: maturities } = await db
      .prepare(
        `${POLICY_SELECT} WHERE c.broker_id = ? AND p.status = 'active'
           AND p.end_date BETWEEN date('now') AND date('now', '+90 days') ORDER BY p.end_date`,
      )
      .bind(user.brokerId)
      .all<PolicyRow>();
    const { results: recent } = await db
      .prepare(`${REQUEST_SELECT} WHERE c.broker_id = ? ORDER BY r.created_at DESC LIMIT 5`)
      .bind(user.brokerId)
      .all<RequestRow>();
    const open = await db
      .prepare(
        `SELECT COUNT(*) AS n FROM requests r JOIN policies p ON p.id = r.policy_id JOIN clients c ON c.id = p.client_id
         WHERE c.broker_id = ? AND r.status IN ('pending', 'in_review')`,
      )
      .bind(user.brokerId)
      .first<{ n: number }>();
    const b21 = round2(totals?.b21 ?? 0);
    const b23 = round2(totals?.b23 ?? 0);
    return json({
      clients: totals?.clients ?? 0,
      activePolicies: totals?.active_policies ?? 0,
      assetsUnderManagement: round2(b21 + b23),
      reservesByBranch: { branch21: b21, branch23: b23 },
      openRequests: open?.n ?? 0,
      maturities: maturities.map(toPolicy),
      recentRequests: recent.map(toRequest),
    });
  })

  // --- clients ---
  .on('GET', '/clients', async (ctx) => {
    const user = await requireUser(ctx.request, ctx.env);
    const [where, params] = scope(user);
    const { page: p, pageSize, offset } = page(ctx.url);
    const search = str(ctx.url.searchParams.get('search')).toLowerCase();
    const type = ctx.url.searchParams.get('type');
    const sort = ctx.url.searchParams.get('sort') === 'createdAt' ? 'c.created_at' : 'display_name';
    const dir = ctx.url.searchParams.get('dir') === 'desc' ? 'DESC' : 'ASC';
    const filters = [where];
    const args = [...params];
    if (search) {
      filters.push(`(LOWER(${CLIENT_NAME_SQL}) LIKE ? OR LOWER(c.email) LIKE ? OR c.national_number LIKE ? OR c.company_number LIKE ?)`);
      const like = `%${search}%`;
      args.push(like, like, like, like);
    }
    if (type === 'person' || type === 'company') {
      filters.push('c.type = ?');
      args.push(type);
    }
    const whereSql = filters.join(' AND ');
    const total = await ctx.env.DB.prepare(`SELECT COUNT(*) AS n FROM clients c WHERE ${whereSql}`)
      .bind(...args)
      .first<{ n: number }>();
    const { results } = await ctx.env.DB.prepare(
      `SELECT c.*, ${CLIENT_NAME_SQL} AS display_name,
              (SELECT COUNT(*) FROM policies p WHERE p.client_id = c.id) AS policy_count,
              (SELECT COALESCE(SUM(${VALUE_SQL}), 0) FROM policies p JOIN products pr ON pr.id = p.product_id WHERE p.client_id = c.id) AS total_value
       FROM clients c WHERE ${whereSql} ORDER BY ${sort} ${dir}, c.id LIMIT ? OFFSET ?`,
    )
      .bind(...args, pageSize, offset)
      .all<ClientRow>();
    return json({ items: results.map(toClient), total: total?.n ?? 0, page: p, pageSize });
  })
  .on('GET', '/clients/:id', async (ctx) => {
    const user = await requireUser(ctx.request, ctx.env);
    const [where, params] = scope(user);
    const row = await ctx.env.DB.prepare(`SELECT c.*, ${CLIENT_NAME_SQL} AS display_name FROM clients c WHERE c.id = ? AND ${where}`)
      .bind(Number(ctx.params['id']), ...params)
      .first<ClientRow>();
    if (!row) throw notFound('Client');
    const { results: policies } = await ctx.env.DB.prepare(`${POLICY_SELECT} WHERE p.client_id = ? ORDER BY p.start_date DESC`)
      .bind(row.id)
      .all<PolicyRow>();
    const { results: requests } = await ctx.env.DB.prepare(`${REQUEST_SELECT} WHERE c.id = ? ORDER BY r.created_at DESC`)
      .bind(row.id)
      .all<RequestRow>();
    return json({ ...toClient(row), policies: policies.map(toPolicy), requests: requests.map(toRequest) });
  })
  .on('POST', '/clients', async (ctx) => {
    const user = await requireUser(ctx.request, ctx.env);
    requireRole(user, 'broker');
    const c = validateClient(await readJson(ctx.request));
    await assertUnique(ctx, user, c, null);
    const row = await ctx.env.DB.prepare(
      `INSERT INTO clients (broker_id, type, first_name, last_name, birth_date, national_number, company_name, company_number,
                            email, phone, iban, city, language, risk_profile, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
    )
      .bind(user.brokerId, c.type, c.first_name, c.last_name, c.birth_date, c.national_number, c.company_name, c.company_number,
        c.email, c.phone, c.iban, c.city, c.language, c.risk_profile, nowIso())
      .first<{ id: number }>();
    return clientById(ctx, row!.id, 201);
  })
  .on('PUT', '/clients/:id', async (ctx) => {
    const user = await requireUser(ctx.request, ctx.env);
    requireRole(user, 'broker');
    const id = Number(ctx.params['id']);
    const existing = await ctx.env.DB.prepare('SELECT type FROM clients WHERE id = ? AND broker_id = ?')
      .bind(id, user.brokerId)
      .first<{ type: string }>();
    if (!existing) throw notFound('Client');
    const c = validateClient(await readJson(ctx.request));
    if (c.type !== existing.type) throw badRequest('The client type cannot change', { type: 'The client type cannot change' });
    await assertUnique(ctx, user, c, id);
    await ctx.env.DB.prepare(
      `UPDATE clients SET first_name = ?, last_name = ?, birth_date = ?, national_number = ?, company_name = ?, company_number = ?,
              email = ?, phone = ?, iban = ?, city = ?, language = ?, risk_profile = ? WHERE id = ?`,
    )
      .bind(c.first_name, c.last_name, c.birth_date, c.national_number, c.company_name, c.company_number,
        c.email, c.phone, c.iban, c.city, c.language, c.risk_profile, id)
      .run();
    return clientById(ctx, id, 200);
  })

  // --- policies ---
  .on('GET', '/policies', async (ctx) => {
    const user = await requireUser(ctx.request, ctx.env);
    const [where, params] = scope(user);
    const { page: p, pageSize, offset } = page(ctx.url);
    const filters = [where];
    const args = [...params];
    const search = str(ctx.url.searchParams.get('search')).toLowerCase();
    if (search) {
      filters.push(`(LOWER(p.policy_number) LIKE ? OR LOWER(${CLIENT_NAME_SQL}) LIKE ?)`);
      args.push(`%${search}%`, `%${search}%`);
    }
    const branch = ctx.url.searchParams.get('branch');
    if (branch === '21' || branch === '23') {
      filters.push('pr.branch = ?');
      args.push(Number(branch));
    }
    const status = ctx.url.searchParams.get('status');
    if (status && ['active', 'surrendered', 'matured'].includes(status)) {
      filters.push('p.status = ?');
      args.push(status);
    }
    const whereSql = filters.join(' AND ');
    const total = await ctx.env.DB.prepare(
      `SELECT COUNT(*) AS n FROM policies p JOIN clients c ON c.id = p.client_id JOIN products pr ON pr.id = p.product_id WHERE ${whereSql}`,
    )
      .bind(...args)
      .first<{ n: number }>();
    const { results } = await ctx.env.DB.prepare(`${POLICY_SELECT} WHERE ${whereSql} ORDER BY p.policy_number LIMIT ? OFFSET ?`)
      .bind(...args, pageSize, offset)
      .all<PolicyRow>();
    return json({ items: results.map(toPolicy), total: total?.n ?? 0, page: p, pageSize });
  })
  .on('GET', '/policies/:id', async (ctx) => {
    const user = await requireUser(ctx.request, ctx.env);
    const row = await findPolicy(ctx, user, Number(ctx.params['id']));
    const product = await ctx.env.DB.prepare('SELECT * FROM products WHERE id = ?').bind(row.product_id).first<ProductRow>();
    let branch21 = null;
    let branch23 = null;
    if (row.branch === 21) {
      const { results } = await ctx.env.DB.prepare(
        'SELECT year, guaranteed_rate, profit_sharing_rate, reserve FROM b21_yearly WHERE policy_id = ? ORDER BY year',
      )
        .bind(row.id)
        .all<{ year: number; guaranteed_rate: number; profit_sharing_rate: number; reserve: number }>();
      branch21 = {
        history: results.map((y) => ({ year: y.year, guaranteedRate: y.guaranteed_rate, profitSharingRate: y.profit_sharing_rate, reserve: y.reserve })),
      };
    } else {
      branch23 = { funds: await holdings(ctx, row.id) };
    }
    const { results: requests } = await ctx.env.DB.prepare(`${REQUEST_SELECT} WHERE r.policy_id = ? ORDER BY r.created_at DESC`)
      .bind(row.id)
      .all<RequestRow>();
    return json({ ...toPolicy(row), product: toProduct(product!), branch21, branch23, requests: requests.map(toRequest) });
  })

  // --- products & funds ---
  .on('GET', '/products', async (ctx) => {
    await requireUser(ctx.request, ctx.env);
    const type = ctx.url.searchParams.get('clientType');
    const stmt =
      type === 'person' || type === 'company'
        ? ctx.env.DB.prepare('SELECT * FROM products WHERE client_type = ? ORDER BY branch, code').bind(type)
        : ctx.env.DB.prepare('SELECT * FROM products ORDER BY branch, code');
    const { results } = await stmt.all<ProductRow>();
    return json(results.map(toProduct));
  })
  .on('GET', '/funds', async (ctx) => {
    await requireUser(ctx.request, ctx.env);
    const navs = await latestNavs(ctx);
    return json(
      navs.map((f) => ({
        id: f.id,
        isin: f.isin,
        name: f.name,
        riskClass: f.risk_class,
        currency: f.currency,
        nav: f.nav,
        navDate: f.price_date,
        change1y: f.nav_1y ? Math.round((f.nav / f.nav_1y - 1) * 10000) / 10000 : null,
      })),
    );
  })
  .on('GET', '/funds/:id/prices', async (ctx) => {
    await requireUser(ctx.request, ctx.env);
    const from = ctx.url.searchParams.get('from') ?? '0000-01-01';
    if (!ISO_DATE.test(from) && from !== '0000-01-01') throw badRequest('"from" must be YYYY-MM-DD');
    const { results } = await ctx.env.DB.prepare(
      'SELECT price_date AS date, nav FROM fund_prices WHERE fund_id = ? AND price_date >= ? ORDER BY price_date',
    )
      .bind(Number(ctx.params['id']), from)
      .all<{ date: string; nav: number }>();
    if (results.length === 0) throw notFound('Fund');
    return json(results);
  })

  // --- requests ---
  .on('GET', '/requests', async (ctx) => {
    const user = await requireUser(ctx.request, ctx.env);
    const [where, params] = scope(user);
    const filters = [where];
    const args = [...params];
    const status = ctx.url.searchParams.get('status');
    if (status === 'open') filters.push(`r.status IN ('pending', 'in_review')`);
    else if (status && ['pending', 'in_review', 'approved', 'rejected'].includes(status)) {
      filters.push('r.status = ?');
      args.push(status);
    }
    const { results } = await ctx.env.DB.prepare(`${REQUEST_SELECT} WHERE ${filters.join(' AND ')} ORDER BY r.created_at DESC`)
      .bind(...args)
      .all<RequestRow>();
    return json(results.map(toRequest));
  })
  .on('GET', '/requests/:id', async (ctx) => {
    const user = await requireUser(ctx.request, ctx.env);
    const row = await findRequest(ctx, user, Number(ctx.params['id']));
    const policy = await findPolicy(ctx, user, row.policy_id);
    const client = await ctx.env.DB.prepare('SELECT iban, email, type FROM clients WHERE id = ?')
      .bind(policy.client_id)
      .first<{ iban: string; email: string; type: string }>();
    return json({
      ...toRequest(row),
      policy: { ...toPolicy(policy), funds: policy.branch === 23 ? await holdings(ctx, policy.id) : [] },
      client: { id: policy.client_id, name: policy.client_name, type: client?.type, iban: client?.iban, email: client?.email },
    });
  })
  .on('POST', '/requests', async (ctx) => {
    const user = await requireUser(ctx.request, ctx.env);
    requireRole(user, 'broker');
    const body = await readJson(ctx.request);
    const policy = await findPolicy(ctx, user, Number(body['policyId']));
    if (policy.status !== 'active') throw new HttpError(409, 'policy_closed', 'This policy is not active');
    const type = body['type'];
    const raw = (body['payload'] ?? {}) as Record<string, unknown>;
    let payload: unknown;
    if (type === 'fund_switch') {
      if (policy.branch !== 23) throw badRequest('A fund switch is only possible on a branch 23 policy');
      const funds = (await latestNavs(ctx)).map((f) => f.id);
      payload = { allocations: validateAllocations(raw['allocations'], funds) };
    } else if (type === 'partial_surrender') {
      const amount = amountOf(raw['amount']);
      if (amount >= policy.current_value) {
        throw badRequest('The amount must be lower than the current value', {
          amount: `Must be lower than the current value (${round2(policy.current_value)} EUR)`,
        });
      }
      const iban = str(raw['iban']).toUpperCase();
      if (!isValidBelgianIban(iban)) throw badRequest('Not a valid Belgian IBAN', { iban: 'Not a valid Belgian IBAN' });
      payload = { amount, iban };
    } else if (type === 'extra_premium') {
      const amount = amountOf(raw['amount']);
      if (amount < 500 || amount > 1_000_000) throw badRequest('Between 500 and 1,000,000 EUR', { amount: 'Between 500 and 1,000,000 EUR' });
      payload = { amount };
    } else {
      throw badRequest('Unknown request type', { type: 'Choose fund_switch, partial_surrender or extra_premium' });
    }
    const open = await ctx.env.DB.prepare(
      `SELECT id FROM requests WHERE policy_id = ? AND type = ? AND status IN ('pending', 'in_review')`,
    )
      .bind(policy.id, type)
      .first<{ id: number }>();
    if (open) throw new HttpError(409, 'already_open', `Request #${open.id} of this type is already open on this policy`);
    const row = await ctx.env.DB.prepare(
      `INSERT INTO requests (policy_id, type, payload, status, created_at, created_by) VALUES (?, ?, ?, 'pending', ?, ?) RETURNING id`,
    )
      .bind(policy.id, type, JSON.stringify(payload), nowIso(), user.id)
      .first<{ id: number }>();
    return json(toRequest(await findRequest(ctx, user, row!.id)), 201);
  })
  .on('POST', '/requests/:id/claim', async (ctx) => {
    const user = await requireUser(ctx.request, ctx.env);
    requireRole(user, 'underwriter');
    const row = await findRequest(ctx, user, Number(ctx.params['id']));
    if (row.status !== 'pending') throw new HttpError(409, 'wrong_status', `The request is ${row.status}, not pending`);
    await ctx.env.DB.prepare(`UPDATE requests SET status = 'in_review', assigned_to = ? WHERE id = ?`).bind(user.id, row.id).run();
    return json(toRequest(await findRequest(ctx, user, row.id)));
  })
  .on('POST', '/requests/:id/decision', async (ctx) => {
    const user = await requireUser(ctx.request, ctx.env);
    requireRole(user, 'underwriter');
    const body = await readJson(ctx.request);
    const decision = body['decision'];
    const comment = str(body['comment']);
    if (decision !== 'approve' && decision !== 'reject') throw badRequest('Decision must be approve or reject', { decision: 'Required' });
    if (decision === 'reject' && comment.length < 5) {
      throw badRequest('Explain why the request is rejected', { comment: 'At least 5 characters' });
    }
    const row = await findRequest(ctx, user, Number(ctx.params['id']));
    if (row.status !== 'pending' && row.status !== 'in_review') {
      throw new HttpError(409, 'wrong_status', `The request is already ${row.status}`);
    }
    const effects = decision === 'approve' ? await approveEffects(ctx, user, row) : [];
    await ctx.env.DB.batch([
      ...effects,
      ctx.env.DB.prepare(
        `UPDATE requests SET status = ?, assigned_to = ?, decided_at = ?, decision_comment = ? WHERE id = ?`,
      ).bind(decision === 'approve' ? 'approved' : 'rejected', user.id, nowIso(), comment || null, row.id),
    ]);
    return json(toRequest(await findRequest(ctx, user, row.id)));
  })

  // --- quotes ---
  .on('POST', '/quotes', async (ctx) => {
    const user = await requireUser(ctx.request, ctx.env);
    requireRole(user, 'broker');
    const body = await readJson(ctx.request);
    const client = await ctx.env.DB.prepare('SELECT id, type FROM clients WHERE id = ? AND broker_id = ?')
      .bind(Number(body['clientId']), user.brokerId)
      .first<{ id: number; type: string }>();
    if (!client) throw notFound('Client');
    const product = await ctx.env.DB.prepare('SELECT * FROM products WHERE code = ?').bind(str(body['productCode'])).first<ProductRow>();
    if (!product) throw badRequest('Unknown product', { productCode: 'Unknown product' });
    if (product.client_type !== client.type) throw badRequest('This product is not for this type of client', { productCode: 'Not for this client' });
    const premium = amountOf(body['premium'], 'premium');
    if (premium < product.min_premium) throw badRequest('Premium too low', { premium: `At least ${product.min_premium} EUR` });
    const years = Number(body['durationYears']);
    if (!Number.isInteger(years) || years < 1 || years > 40) throw badRequest('Duration from 1 to 40 years', { durationYears: 'From 1 to 40 years' });
    let allocations = null;
    if (product.branch === 23) {
      const funds = (await latestNavs(ctx)).map((f) => f.id);
      allocations = JSON.stringify(validateAllocations(body['allocations'], funds));
    }
    const count = await ctx.env.DB.prepare('SELECT COUNT(*) AS n FROM quotes').first<{ n: number }>();
    const reference = `Q-${new Date().getUTCFullYear()}-${String((count?.n ?? 0) + 1).padStart(6, '0')}`;
    const row = await ctx.env.DB.prepare(
      `INSERT INTO quotes (reference, client_id, product_id, premium, duration_years, allocations, created_at, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING id, reference, created_at`,
    )
      .bind(reference, client.id, product.id, premium, years, allocations, nowIso(), user.id)
      .first<{ id: number; reference: string; created_at: string }>();
    return json({ id: row!.id, reference: row!.reference, createdAt: row!.created_at }, 201);
  })
  .on('GET', '/quotes', async (ctx) => {
    const user = await requireUser(ctx.request, ctx.env);
    const [where, params] = scope(user);
    const { results } = await ctx.env.DB.prepare(
      `SELECT q.id, q.reference, q.client_id, ${CLIENT_NAME_SQL} AS client_name, pr.code AS product_code, q.premium,
              q.duration_years, q.allocations, q.created_at
       FROM quotes q JOIN clients c ON c.id = q.client_id JOIN products pr ON pr.id = q.product_id
       WHERE ${where} ORDER BY q.created_at DESC`,
    )
      .bind(...params)
      .all<{ id: number; reference: string; client_id: number; client_name: string; product_code: string; premium: number; duration_years: number; allocations: string | null; created_at: string }>();
    return json(
      results.map((q) => ({
        id: q.id,
        reference: q.reference,
        clientId: q.client_id,
        clientName: q.client_name,
        productCode: q.product_code,
        premium: q.premium,
        durationYears: q.duration_years,
        allocations: q.allocations ? (JSON.parse(q.allocations) as unknown) : null,
        createdAt: q.created_at,
      })),
    );
  });

// ---------- helpers used above ----------
interface ProductRow {
  id: number;
  code: string;
  name: string;
  branch: 21 | 23;
  client_type: 'person' | 'company';
  guaranteed_rate: number | null;
  entry_fee_rate: number;
  management_fee_rate: number;
  min_premium: number;
  description: string;
}
const toProduct = (p: ProductRow) => ({
  id: p.id,
  code: p.code,
  name: p.name,
  branch: p.branch,
  clientType: p.client_type,
  guaranteedRate: p.guaranteed_rate,
  entryFeeRate: p.entry_fee_rate,
  managementFeeRate: p.management_fee_rate,
  minPremium: p.min_premium,
  premiumTaxRate: PREMIUM_TAX[p.client_type],
  description: p.description,
});

async function clientById(ctx: Ctx, id: number, status: number) {
  const row = await ctx.env.DB.prepare(`SELECT c.*, ${CLIENT_NAME_SQL} AS display_name FROM clients c WHERE c.id = ?`)
    .bind(id)
    .first<ClientRow>();
  return json(toClient(row!), status);
}

async function assertUnique(ctx: Ctx, user: User, c: ReturnType<typeof validateClient>, exceptId: number | null) {
  const column = c.type === 'person' ? 'national_number' : 'company_number';
  const value = c.type === 'person' ? c.national_number : c.company_number;
  const dup = await ctx.env.DB.prepare(`SELECT id FROM clients WHERE broker_id = ? AND ${column} = ? AND id <> ?`)
    .bind(user.brokerId, value, exceptId ?? 0)
    .first<{ id: number }>();
  if (dup) {
    const field = c.type === 'person' ? 'nationalNumber' : 'companyNumber';
    throw new HttpError(409, 'duplicate', 'This client already exists', { [field]: `Already used by client #${dup.id}` });
  }
}

async function findRequest(ctx: Ctx, user: User, id: number) {
  const [where, params] = scope(user);
  const row = await ctx.env.DB.prepare(`${REQUEST_SELECT} WHERE r.id = ? AND ${where}`)
    .bind(id, ...params)
    .first<RequestRow>();
  if (!row) throw notFound('Request');
  return row;
}

/** The database changes an approved request makes (run in one batch = one transaction with the status update). */
async function approveEffects(ctx: Ctx, user: User, req: RequestRow): Promise<D1PreparedStatement[]> {
  const db = ctx.env.DB;
  const policy = await findPolicy(ctx, user, req.policy_id);
  if (policy.status !== 'active') throw new HttpError(409, 'policy_closed', 'This policy is not active any more');
  const payload = JSON.parse(req.payload) as { allocations?: { fundId: number; percent: number }[]; amount?: number };
  const navs = await latestNavs(ctx);
  const navOf = (fundId: number) => navs.find((n) => n.id === fundId)!.nav;
  const value = policy.current_value;

  if (req.type === 'fund_switch') {
    return [
      db.prepare('DELETE FROM policy_units WHERE policy_id = ?').bind(policy.id),
      ...payload.allocations!.map((a) =>
        db.prepare('INSERT INTO policy_units (policy_id, fund_id, units) VALUES (?, ?, ?)')
          .bind(policy.id, a.fundId, (value * a.percent) / 100 / navOf(a.fundId)),
      ),
    ];
  }
  const amount = payload.amount!;
  if (req.type === 'partial_surrender') {
    if (amount >= value) throw new HttpError(409, 'insufficient_value', 'The policy value is now lower than the amount');
    if (policy.branch === 23) {
      return [db.prepare('UPDATE policy_units SET units = units * ? WHERE policy_id = ?').bind(1 - amount / value, policy.id)];
    }
    return [latestReserveUpdate(ctx, policy.id, -amount)];
  }
  // extra_premium
  const product = await db.prepare('SELECT * FROM products WHERE id = ?').bind(policy.product_id).first<ProductRow>();
  const net = amount * (1 - PREMIUM_TAX[policy.client_type]) * (1 - product!.entry_fee_rate);
  const premiums = db.prepare('UPDATE policies SET total_premiums = total_premiums + ? WHERE id = ?').bind(amount, policy.id);
  if (policy.branch === 21) return [latestReserveUpdate(ctx, policy.id, net), premiums];
  const funds = await holdings(ctx, policy.id);
  return [
    ...funds.map((f) =>
      db.prepare('UPDATE policy_units SET units = units + ? WHERE policy_id = ? AND fund_id = ?')
        .bind((net * f.share) / 100 / f.nav, policy.id, f.fundId),
    ),
    premiums,
  ];
}

function latestReserveUpdate(ctx: Ctx, policyId: number, delta: number) {
  return ctx.env.DB.prepare(
    `UPDATE b21_yearly SET reserve = ROUND(reserve + ?, 2)
     WHERE policy_id = ? AND year = (SELECT MAX(year) FROM b21_yearly WHERE policy_id = ?)`,
  ).bind(delta, policyId, policyId);
}

