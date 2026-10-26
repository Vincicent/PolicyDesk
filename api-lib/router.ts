// A tiny router: "GET /clients/:id" → handler({ params: { id } }).
import { type Env, HttpError } from './http';

export interface Ctx {
  request: Request;
  env: Env;
  url: URL;
  params: Record<string, string>;
}
type Handler = (ctx: Ctx) => Promise<Response>;

export class Router {
  private routes: { method: string; parts: string[]; handler: Handler }[] = [];

  on(method: string, path: string, handler: Handler) {
    this.routes.push({ method, parts: path.split('/').filter(Boolean), handler });
    return this;
  }

  async handle(request: Request, env: Env, path: string): Promise<Response> {
    const url = new URL(request.url);
    const parts = path.split('/').filter(Boolean);
    let pathMatched = false;
    for (const route of this.routes) {
      const params = match(route.parts, parts);
      if (!params) continue;
      pathMatched = true;
      if (route.method === request.method) return route.handler({ request, env, url, params });
    }
    if (pathMatched) throw new HttpError(405, 'method_not_allowed', `${request.method} is not allowed here`);
    throw new HttpError(404, 'not_found', `No endpoint ${request.method} /api/${parts.join('/')}`);
  }
}

function match(pattern: string[], parts: string[]): Record<string, string> | null {
  if (pattern.length !== parts.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < pattern.length; i++) {
    const p = pattern[i]!;
    const v = parts[i]!;
    if (p.startsWith(':')) params[p.slice(1)] = decodeURIComponent(v);
    else if (p !== v) return null;
  }
  return params;
}
