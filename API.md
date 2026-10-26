# PolicyDesk API (the contract)

Base URL: same origin as the app (`/api/...`, `/soap/...`). Locally: `npm run api` → http://localhost:8788.
JSON in, JSON out, camelCase fields. Dates are ISO strings (`2026-10-23`, `2026-10-23T14:00:00.000Z`). Money is a number in EUR.

## Authentication
`POST /api/login` with `{ "username": "dupont", "password": "demo" }` → `{ token, user }`.
Send the token on every other call: `Authorization: Bearer <token>` (a signed JWT, valid 8 hours).

| Demo user | Role | Sees |
|---|---|---|
| `dupont` / `demo` | broker (Dupont & Fils, Namur) | own clients only (36) |
| `janssens` / `demo` | broker (Janssens Verzekeringen, Leuven) | own clients only (15) |
| `martin` / `demo` | underwriter | every request, every policy |

## Errors
Always `{ "error": { "code", "message", "details"? } }` with an HTTP status:
`400 validation_error` (`details` = `{ field: message }`), `401 unauthorized`, `403 forbidden`, `404 not_found`,
`405 method_not_allowed`, `409` (`duplicate`, `already_open`, `wrong_status`, `policy_closed`, `insufficient_value`), `500 server_error`.

## Endpoints
| Method & path | Who | What |
|---|---|---|
| `GET /api/health` | anyone | `{ ok, time }` |
| `POST /api/login` | anyone | `{ token, user }` |
| `GET /api/me` | signed in | the user |
| `GET /api/dashboard` | broker | `{ clients, activePolicies, assetsUnderManagement, reservesByBranch: { branch21, branch23 }, openRequests, maturities: Policy[], recentRequests: Request[] }` |
| `GET /api/clients?search=&type=person\|company&sort=name\|createdAt&dir=asc\|desc&page=1&pageSize=10` | signed in | `{ items: Client[], total, page, pageSize }` (pageSize ≤ 50); each item has `policyCount`, `totalValue` |
| `GET /api/clients/:id` | signed in | `Client` + `policies: Policy[]` + `requests: Request[]` |
| `POST /api/clients` | broker | create → `201 Client` |
| `PUT /api/clients/:id` | broker | update (the type can't change) → `Client` |
| `GET /api/policies?search=&branch=21\|23&status=active\|surrendered\|matured&page=&pageSize=` | signed in | `{ items: Policy[], total, page, pageSize }` |
| `GET /api/policies/:id` | signed in | `Policy` + `product` + `branch21: { history[] } \| null` + `branch23: { funds[] } \| null` + `requests[]` |
| `GET /api/products?clientType=person\|company` | signed in | `Product[]` (with `premiumTaxRate`) |
| `GET /api/funds` | signed in | `Fund[]` with the latest `nav`, `navDate`, `change1y` |
| `GET /api/funds/:id/prices?from=YYYY-MM-DD` | signed in | `[{ date, nav }]`, one per week |
| `GET /api/requests?status=open\|pending\|in_review\|approved\|rejected` | signed in | `Request[]`, newest first (`open` = pending + in review) |
| `GET /api/requests/:id` | signed in | `Request` + `policy` (with `funds`) + `client` (`iban`, `email`, `type`) |
| `POST /api/requests` | broker | `{ policyId, type, payload }` → `201 Request` |
| `POST /api/requests/:id/claim` | underwriter | pending → in review, assigned to you |
| `POST /api/requests/:id/decision` | underwriter | `{ decision: "approve" \| "reject", comment }` (comment ≥ 5 chars to reject) |
| `POST /api/quotes` | broker | `{ clientId, productCode, premium, durationYears, allocations? }` → `201 { id, reference, createdAt }` |
| `GET /api/quotes` | signed in | saved quotes |

### Request payloads
| `type` | `payload` | Rules |
|---|---|---|
| `fund_switch` | `{ allocations: [{ fundId, percent }] }` | branch 23 only, 1–4 funds, whole percentages adding up to 100 |
| `partial_surrender` | `{ amount, iban }` | amount < current value, Belgian IBAN |
| `extra_premium` | `{ amount }` | 500 to 1,000,000 |

Only one open request of each type per policy (`409 already_open`). Approving applies it to the policy (all changes in one batch).

### Client body
`{ type: "person" | "company", firstName, lastName, birthDate, nationalNumber` (persons) `| companyName, companyNumber` (companies)`,
email, phone?, iban, city, language: "fr" | "nl" | "en", riskProfile?: "defensive" | "neutral" | "dynamic" | null }`.
National number, company number and IBAN are checked with the Belgian check-digit rules (mod 97).

## SOAP: the "legacy" policy system
- `GET /soap/policy?wsdl` → the WSDL (service contract).
- `POST /soap/policy`, headers `Content-Type: text/xml` and `SOAPAction: "urn:policydesk:GetPolicyValuation"`, plus the same `Authorization: Bearer` header:

```xml
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:pd="urn:policydesk:valuation">
  <soap:Body>
    <pd:GetPolicyValuationRequest><pd:PolicyNumber>B23-004001</pd:PolicyNumber></pd:GetPolicyValuationRequest>
  </soap:Body>
</soap:Envelope>
```
Answer: `GetPolicyValuationResponse` with `PolicyNumber, Branch, Status, ValuationDate, Currency, GrossValue, SurrenderFeeRate,
SurrenderValue, Funds/Fund (Isin, Name, Units, Nav, Value)`. Errors are SOAP 1.1 faults (HTTP 500, `<faultcode>soap:Client|soap:Server</faultcode>`).

## Data model (D1 = SQLite)
`brokers` 1–n `clients` 1–n `policies` n–1 `products`; `policies` 1–n `b21_yearly` (branch 21 reserve per year),
`policies` n–n `funds` through `policy_units`; `funds` 1–n `fund_prices` (weekly NAV); `policies` 1–n `requests`; `clients` 1–n `quotes`.
Schema: `migrations/0001_schema.sql`. Demo data: `migrations/0002_seed.sql`, generated by `db/generate-seed.mjs` (fictional people and numbers).
