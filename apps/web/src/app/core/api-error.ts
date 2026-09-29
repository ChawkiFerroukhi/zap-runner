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
    if (error.status === 0) return { code: 'network', message: 'Could not reach the server.' };
  }
  return { code: 'unknown', message: 'Something went wrong. Try again.' };
}
