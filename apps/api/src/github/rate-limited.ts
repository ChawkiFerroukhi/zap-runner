import type { RequestError } from '@octokit/request-error';

export function githubRateLimited(error: RequestError): boolean {
  const remaining = error.response?.headers['x-ratelimit-remaining'];
  return error.status === 429 || (error.status === 403 && remaining === '0');
}
