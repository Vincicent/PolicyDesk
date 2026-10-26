-- PolicyDesk schema (SQLite dialect, used by Cloudflare D1).
-- The SQL Server equivalent of each choice is in cheatsheets/sql-server.md.

CREATE TABLE brokers (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT    NOT NULL,
  fsma_number TEXT    NOT NULL UNIQUE,  -- brokers are registered with the Belgian regulator (FSMA)
  city        TEXT    NOT NULL
);

CREATE TABLE users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT    NOT NULL UNIQUE,
  display_name  TEXT    NOT NULL,
  role          TEXT    NOT NULL CHECK (role IN ('broker', 'underwriter')),
  broker_id     INTEGER REFERENCES brokers (id),
  password_hash TEXT    NOT NULL       -- SHA-256 of "demo": a demo only. Real apps use Argon2/bcrypt/PBKDF2.
);

CREATE TABLE clients (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  broker_id       INTEGER NOT NULL REFERENCES brokers (id),
  type            TEXT    NOT NULL CHECK (type IN ('person', 'company')),
  first_name      TEXT,
  last_name       TEXT,
  birth_date      TEXT,                -- ISO date (YYYY-MM-DD), persons only
  national_number TEXT,                -- Belgian national register number, persons only
  company_name    TEXT,
  company_number  TEXT,                -- Belgian company number (BCE/KBO), companies only
  email           TEXT    NOT NULL,
  phone           TEXT,
  iban            TEXT    NOT NULL,
  city            TEXT    NOT NULL,
  language        TEXT    NOT NULL CHECK (language IN ('fr', 'nl', 'en')),
  risk_profile    TEXT    CHECK (risk_profile IN ('defensive', 'neutral', 'dynamic')),
  created_at      TEXT    NOT NULL     -- ISO date-time, UTC
);
CREATE INDEX ix_clients_broker ON clients (broker_id, last_name);

CREATE TABLE products (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  code               TEXT    NOT NULL UNIQUE,
  name               TEXT    NOT NULL,
  branch             INTEGER NOT NULL CHECK (branch IN (21, 23)),
  client_type        TEXT    NOT NULL CHECK (client_type IN ('person', 'company')),
  guaranteed_rate    REAL,             -- branch 21 only, e.g. 0.015 = 1.5 % a year
  entry_fee_rate     REAL    NOT NULL, -- taken from each premium
  management_fee_rate REAL   NOT NULL, -- branch 23: yearly fee on the fund value
  min_premium        REAL    NOT NULL,
  description        TEXT    NOT NULL
);

CREATE TABLE funds (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  isin       TEXT    NOT NULL UNIQUE,
  name       TEXT    NOT NULL,
  risk_class INTEGER NOT NULL CHECK (risk_class BETWEEN 1 AND 7),  -- SRI scale of the PRIIPs KID
  currency   TEXT    NOT NULL DEFAULT 'EUR'
);

CREATE TABLE fund_prices (
  fund_id    INTEGER NOT NULL REFERENCES funds (id),
  price_date TEXT    NOT NULL,
  nav        REAL    NOT NULL,         -- net asset value of one unit
  PRIMARY KEY (fund_id, price_date)
);

CREATE TABLE policies (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  policy_number TEXT    NOT NULL UNIQUE,
  client_id     INTEGER NOT NULL REFERENCES clients (id),
  product_id    INTEGER NOT NULL REFERENCES products (id),
  status        TEXT    NOT NULL CHECK (status IN ('active', 'surrendered', 'matured')),
  start_date    TEXT    NOT NULL,
  end_date      TEXT,                  -- maturity date, NULL = whole life
  total_premiums REAL   NOT NULL
);
CREATE INDEX ix_policies_client ON policies (client_id);

-- Branch 21: one row per year (reserve at the end of the year, rates credited that year).
CREATE TABLE b21_yearly (
  policy_id          INTEGER NOT NULL REFERENCES policies (id),
  year               INTEGER NOT NULL,
  guaranteed_rate    REAL    NOT NULL,
  profit_sharing_rate REAL   NOT NULL,
  reserve            REAL    NOT NULL,
  PRIMARY KEY (policy_id, year)
);

-- Branch 23: the units each policy holds in each fund.
CREATE TABLE policy_units (
  policy_id INTEGER NOT NULL REFERENCES policies (id),
  fund_id   INTEGER NOT NULL REFERENCES funds (id),
  units     REAL    NOT NULL,
  PRIMARY KEY (policy_id, fund_id)
);

CREATE TABLE requests (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  policy_id        INTEGER NOT NULL REFERENCES policies (id),
  type             TEXT    NOT NULL CHECK (type IN ('fund_switch', 'partial_surrender', 'extra_premium')),
  payload          TEXT    NOT NULL,   -- JSON, shape depends on type
  status           TEXT    NOT NULL CHECK (status IN ('pending', 'in_review', 'approved', 'rejected')),
  created_at       TEXT    NOT NULL,
  created_by       INTEGER NOT NULL REFERENCES users (id),
  assigned_to      INTEGER REFERENCES users (id),
  decided_at       TEXT,
  decision_comment TEXT
);
CREATE INDEX ix_requests_status ON requests (status, created_at);

CREATE TABLE quotes (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  reference      TEXT    NOT NULL UNIQUE,
  client_id      INTEGER NOT NULL REFERENCES clients (id),
  product_id     INTEGER NOT NULL REFERENCES products (id),
  premium        REAL    NOT NULL,
  duration_years INTEGER NOT NULL,
  allocations    TEXT,                 -- JSON, branch 23 only
  created_at     TEXT    NOT NULL,
  created_by     INTEGER NOT NULL REFERENCES users (id)
);
