// Resets the LIVE database to the demo data: drops every table, then re-runs the schema and the seed from migrations/.
// Run every night by .github/workflows/reset-demo-db.yml, or by hand: npm run db:reset:remote
// Extra arguments replace --remote, e.g. `node scripts/db-reset-remote.mjs --local --persist-to /some/dir` to try it.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Children first, so no foreign key ever points to a table that's already gone.
const TABLES = [
  'quotes',
  'requests',
  'policy_units',
  'b21_yearly',
  'policies',
  'fund_prices',
  'funds',
  'products',
  'clients',
  'users',
  'brokers',
];

const sql = [
  ...TABLES.map((t) => `DROP TABLE IF EXISTS ${t};`),
  readFileSync('migrations/0001_schema.sql', 'utf8'),
  readFileSync('migrations/0002_seed.sql', 'utf8'),
].join('\n');

const file = join(mkdtempSync(join(tmpdir(), 'policydesk-')), 'reset.sql');
writeFileSync(file, sql);

const target = process.argv.length > 2 ? process.argv.slice(2) : ['--remote'];
execFileSync('npx', ['wrangler', 'd1', 'execute', 'policydesk', ...target, '--file', file, '--yes'], {
  stdio: 'inherit',
});
