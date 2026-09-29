import { Octokit } from '@octokit/rest';
import type { GitHubClientFactory } from '../github/github-client.js';

export interface RecordedRequest {
  method: string;
  path: string;
  body: unknown;
}

interface CannedResponse {
  method: string;
  pattern: RegExp;
  status: number;
  body: unknown;
  remaining: number;
}

function urlOf(input: string | URL | Request): URL {
  if (typeof input === 'string') return new URL(input);
  if (input instanceof URL) return input;
  return new URL(input.url);
}

function parseBody(body: RequestInit['body']): unknown {
  if (typeof body !== 'string') return null;
  const parsed: unknown = JSON.parse(body);
  return parsed;
}

function json(status: number, body: unknown): Response {
  return new Response(status === 204 ? null : JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

export interface FakeGitHub {
  requests: RecordedRequest[];
  githubFor: GitHubClientFactory;
  respond(method: string, pattern: RegExp, status: number, body?: unknown, times?: number): void;
  requestsTo(method: string, pattern: RegExp): RecordedRequest[];
}

export function createFakeGitHub(): FakeGitHub {
  const requests: RecordedRequest[] = [];
  const overrides: CannedResponse[] = [];
  let nextHookId = 9000;
  let nextCommentId = 500;

  function defaultResponse(method: string, path: string): Response {
    if (method === 'POST' && /^\/repos\/[^/]+\/[^/]+\/hooks$/.test(path)) {
      return json(201, { id: nextHookId++ });
    }
    if (method === 'DELETE' && /^\/repos\/[^/]+\/[^/]+\/hooks\/\d+$/.test(path)) {
      return json(204, null);
    }
    const comment = /^\/repos\/([^/]+)\/([^/]+)\/issues\/(\d+)\/comments$/.exec(path);
    if (method === 'POST' && comment) {
      const id = nextCommentId++;
      return json(201, {
        id,
        html_url: `https://github.com/${comment[1] ?? ''}/${comment[2] ?? ''}/pull/${comment[3] ?? ''}#issuecomment-${id}`,
      });
    }
    if (method === 'GET' && path === '/user/repos') return json(200, []);
    return json(404, { message: 'Not Found' });
  }

  const fetch = (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = urlOf(input);
    const method = (init?.method ?? 'GET').toUpperCase();
    requests.push({ method, path: url.pathname, body: parseBody(init?.body) });
    const override = overrides.find(
      (candidate) => candidate.method === method && candidate.pattern.test(url.pathname),
    );
    if (override) {
      override.remaining -= 1;
      if (override.remaining === 0) overrides.splice(overrides.indexOf(override), 1);
      return Promise.resolve(json(override.status, override.body));
    }
    return Promise.resolve(defaultResponse(method, url.pathname));
  };

  return {
    requests,
    githubFor: () =>
      Promise.resolve(new Octokit({ auth: 'test-token', request: { fetch, retries: 0 } })),
    respond(method, pattern, status, body = { message: 'Canned failure' }, times = 1) {
      overrides.push({ method, pattern, status, body, remaining: times });
    },
    requestsTo(method, pattern) {
      return requests.filter((request) => request.method === method && pattern.test(request.path));
    },
  };
}
