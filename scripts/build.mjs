// Builds the site Cloudflare Pages serves: dist/ = Angular portal at /, AngularJS back-office at /backoffice/.
// The functions/ folder (the API) is deployed next to it automatically.
import { execSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';

rmSync('dist', { recursive: true, force: true });
mkdirSync('dist');

if (existsSync('portal/package.json')) {
  execSync('npm --prefix portal run build', { stdio: 'inherit' });
  cpSync('portal/dist/portal/browser', 'dist', { recursive: true });
} else {
  // Before lesson 03 there is no portal yet: send visitors to the back-office.
  writeFileSync('dist/index.html', '<!doctype html><meta http-equiv="refresh" content="0; url=/backoffice/">');
}

cpSync('backoffice', 'dist/backoffice', { recursive: true });
console.log('Built dist/ (portal at /, back-office at /backoffice/)');
