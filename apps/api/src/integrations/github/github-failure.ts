import { RequestError } from '@octokit/request-error';
import { githubRateLimited } from '../../github/rate-limited.js';
import type { ActionResult } from '../definitions.js';

export function githubFailure(error: unknown): Extract<ActionResult, { ok: false }> {
  if (error instanceof RequestError) {
    return {
      ok: false,
      retryable: githubRateLimited(error) || error.status >= 500,
      error: `GitHub responded ${error.status}: ${error.message}`,
    };
  }
  return {
    ok: false,
    retryable: true,
    error: error instanceof Error ? error.message : 'Unknown error',
  };
}
