import { HttpErrorResponse } from '@angular/common/http';
import type { ApiError } from '@zap-runner/shared';

export type ApiErrorDetail = ApiError['error'];

function isApiError(value: unknown): value is ApiError {
  if (typeof value !== 'object' || value === null || !('error' in value)) return false;
  const { error } = value;
  return (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof error.message === 'string' &&
    'code' in error &&
    typeof error.code === 'string'
  );
}

export function toApiError(error: unknown): ApiErrorDetail {
  if (error instanceof HttpErrorResponse) {
    const body: unknown = error.error;
    if (isApiError(body)) return body.error;
    if (error.status === 0)
      return { code: 'network', message: 'Could not reach the server. Check your connection.' };
    if (error.status === 429)
      return { code: 'rate_limited', message: 'Too many requests. Wait a moment and try again.' };
    if (error.status >= 502 && error.status <= 504)
      return {
        code: 'unavailable',
        message: 'The server is not responding. Try again in a moment.',
      };
  }
  return { code: 'unknown', message: 'Something went wrong. Try again.' };
}

const HANDLED_GLOBALLY = new Set(['unauthenticated', 'github_token_invalid']);

export function handledGlobally(detail: ApiErrorDetail): boolean {
  return HANDLED_GLOBALLY.has(detail.code);
}
