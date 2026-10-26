// Demo authentication: a signed token (a real HS256 JWT) that says who the user is.
import { forbidden, HttpError, type Env } from './http';

export type Role = 'broker' | 'underwriter';
export interface User {
  id: number;
  username: string;
  displayName: string;
  role: Role;
  brokerId: number | null;
}

const TOKEN_HOURS = 8;
const enc = new TextEncoder();

const b64url = (bytes: ArrayBuffer | Uint8Array) =>
  btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/, '');
const b64urlJson = (value: unknown) => b64url(enc.encode(JSON.stringify(value)));
const fromB64url = (s: string) => atob(s.replaceAll('-', '+').replaceAll('_', '/'));

async function hmacKey(secret: string) {
  return crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', enc.encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function signToken(user: User, secret: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const head = `${b64urlJson({ alg: 'HS256', typ: 'JWT' })}.${b64urlJson({ sub: user.id, role: user.role, iat: now, exp: now + TOKEN_HOURS * 3600 })}`;
  const sig = await crypto.subtle.sign('HMAC', await hmacKey(secret), enc.encode(head));
  return `${head}.${b64url(sig)}`;
}

const unauthorized = () => new HttpError(401, 'unauthorized', 'Sign in first (missing, invalid or expired token)');

async function verifyToken(token: string, secret: string): Promise<number> {
  const [h, p, s] = token.split('.');
  if (!h || !p || !s) throw unauthorized();
  let payload: { sub: number; exp: number };
  try {
    const sig = Uint8Array.from(fromB64url(s), (c) => c.charCodeAt(0));
    const ok = await crypto.subtle.verify('HMAC', await hmacKey(secret), sig, enc.encode(`${h}.${p}`));
    if (!ok) throw new Error('bad signature');
    payload = JSON.parse(fromB64url(p)) as { sub: number; exp: number };
  } catch {
    throw unauthorized(); // garbage token (not base64, not JSON, wrong signature) = not signed in, never a 500
  }
  if (payload.exp < Date.now() / 1000) throw unauthorized();
  return payload.sub;
}

interface UserRow {
  id: number;
  username: string;
  display_name: string;
  role: Role;
  broker_id: number | null;
}
export const toUser = (r: UserRow): User => ({
  id: r.id,
  username: r.username,
  displayName: r.display_name,
  role: r.role,
  brokerId: r.broker_id,
});

/** Returns the signed-in user, or throws 401. */
export async function requireUser(request: Request, env: Env): Promise<User> {
  const header = request.headers.get('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) throw unauthorized();
  const id = await verifyToken(token, env.TOKEN_SECRET);
  const row = await env.DB.prepare('SELECT id, username, display_name, role, broker_id FROM users WHERE id = ?')
    .bind(id)
    .first<UserRow>();
  if (!row) throw unauthorized();
  return toUser(row);
}

export function requireRole(user: User, role: Role) {
  if (user.role !== role) throw forbidden();
}
