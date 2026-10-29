import { HttpErrorResponse } from '@angular/common/http';
import { ApiError } from './models';

/** Turns any HttpClient error into the API's { code, message, details } shape. */
export function toApiError(err: unknown): ApiError {
  if (err instanceof HttpErrorResponse) {
    const body = err.error as { error?: ApiError } | null;
    if (body?.error) return body.error;
    if (err.status === 0)
      return { code: 'network', message: 'Cannot reach the server. Is `npm run api` running?' };
    return { code: `http_${err.status}`, message: err.message };
  }
  return { code: 'unknown', message: 'Something went wrong' };
}
