// Cloudflare Pages Function: every request to /api/* lands here.
import { errorResponse, type Env } from '../../api-lib/http';
import { router } from '../../api-lib/routes';

export const onRequest: PagesFunction<Env> = async ({ request, env, params }) => {
  const path = Array.isArray(params['path']) ? params['path'].join('/') : (params['path'] ?? '');
  try {
    return await router.handle(request, env, path);
  } catch (err) {
    return errorResponse(err);
  }
};
