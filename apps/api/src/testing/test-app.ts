import { randomBytes } from 'node:crypto';
import { pino } from 'pino';
import type { Response } from 'supertest';
import { createApp, type AppDependencies } from '../app.js';
import type { SessionStore } from '../auth/session-store.js';
import type { GitHubIdentity } from '../github/github-identity.js';
import { createSecretBox } from '../platform/secret-box.js';
import type { UsersRepository } from '../users/users.repository.js';

export const TEST_APP_URL = 'http://app.test';

function unexpected(name: string): never {
  throw new Error(`${name} was not expected to be called`);
}

export const unusedIdentity: GitHubIdentity = {
  authorizeUrl: (state) => `https://github.com/login/oauth/authorize?state=${state}`,
  exchangeCode: () => unexpected('exchangeCode'),
  fetchProfile: () => unexpected('fetchProfile'),
};

export const emptySessions: SessionStore = {
  issue: () => unexpected('issue'),
  resolve: () => Promise.resolve(null),
  revoke: () => Promise.resolve(),
};

export const emptyUsers: UsersRepository = {
  upsertFromGitHub: () => unexpected('upsertFromGitHub'),
  findSessionUser: () => Promise.resolve(null),
  findSealedToken: () => Promise.resolve(null),
};

export function buildTestApp(overrides: Partial<AppDependencies> = {}) {
  return createApp({
    logger: pino({ level: 'silent' }),
    readiness: () => ({ database: true, accepting: true }),
    appUrl: TEST_APP_URL,
    identity: unusedIdentity,
    users: emptyUsers,
    sessions: emptySessions,
    secretBox: createSecretBox(randomBytes(32)),
    ...overrides,
  });
}

export function setCookies(response: Response): string[] {
  const value: unknown = response.headers['set-cookie'];
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}
