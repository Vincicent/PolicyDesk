// Deletes the LOCAL database (.wrangler/state) and re-creates it from migrations/ (schema + seed).
import { execSync } from 'node:child_process';
import { rmSync } from 'node:fs';

rmSync('.wrangler/state/v3/d1', { recursive: true, force: true });
execSync('npx wrangler d1 migrations apply policydesk --local', { stdio: 'inherit', env: { ...process.env, CI: '1' } });
