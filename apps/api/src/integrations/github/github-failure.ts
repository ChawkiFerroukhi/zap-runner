import { RequestError } from '@octokit/request-error';
import type { ActionResult } from '../definitions.js';

export function githubFailure(error: unknown): Extract<ActionResult, { ok: false }> {
  if (error instanceof RequestError) {
    const remaining = error.response?.headers['x-ratelimit-remaining'];
    const rateLimited = error.status === 429 || (error.status === 403 && remaining === '0');
    return {
      ok: false,
      retryable: rateLimited || error.status >= 500,
      error: `GitHub responded ${error.status}: ${error.message}`,
    };
  }
  return {
    ok: false,
    retryable: true,
    error: error instanceof Error ? error.message : 'Unknown error',
  };
}
