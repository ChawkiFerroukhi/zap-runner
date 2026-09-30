import { randomBytes } from 'node:crypto';
import type { CopilotProviderId } from '@zap-runner/shared';
import { pino } from 'pino';
import type { Response } from 'supertest';
import { createApp, type AppDependencies } from '../app.js';
import { createSessionStore, type SessionStore } from '../auth/session-store.js';
import type { CopilotModel } from '../copilot/copilot-model.js';
import { createCopilotService } from '../copilot/copilot-service.js';
import { createPendingDrafts } from '../copilot/pending-drafts.js';
import { createDeliveriesRepository } from '../deliveries/deliveries.repository.js';
import { createDeliveryEvents, type DeliveryEvents } from '../deliveries/delivery-events.js';
import { createDeliveryRunner, type DeliveryRunner } from '../deliveries/delivery-runner.js';
import type { GitHubClientFactory } from '../github/github-client.js';
import type { GitHubIdentity } from '../github/github-identity.js';
import { registry } from '../integrations/registry.js';
import { createSecretBox, type SecretBox } from '../platform/secret-box.js';
import { createUsersRepository, type UsersRepository } from '../users/users.repository.js';
import { createZapLookup } from '../zaps/zap-lookup.js';
import { createZapService } from '../zaps/zap-service.js';

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
  findCopilotKey: () => Promise.resolve(null),
  setCopilotKey: () => Promise.resolve(),
};

const githubUnavailable: GitHubClientFactory = () => unexpected('githubFor');

export interface TestContext {
  app: ReturnType<typeof createApp>;
  runner: DeliveryRunner;
  secretBox: SecretBox;
  events: DeliveryEvents;
}

export interface TestOptions {
  now?: () => Date;
  copilotModel?: CopilotModel;
  serverCopilotKey?: { provider: CopilotProviderId; apiKey: string };
}

function unusedCopilotModel(id: CopilotProviderId): CopilotModel {
  return {
    provider: {
      id,
      name: `Test ${id}`,
      models: ['test-model'],
      keyUrl: 'https://keys.test',
      pricing: 'free-tier',
    },
    verifyKey: () => unexpected('verifyKey'),
    draft: () => unexpected('draft'),
  };
}

export function createTestContext(
  overrides: Partial<AppDependencies> = {},
  options: TestOptions = {},
): TestContext {
  const logger = pino({ level: 'silent' });
  const secretBox = overrides.secretBox ?? createSecretBox(randomBytes(32));
  const githubFor = overrides.githubFor ?? githubUnavailable;
  const zaps = createZapLookup();
  const events = overrides.events ?? createDeliveryEvents();
  const deliveries = createDeliveriesRepository(events);
  const runner =
    overrides.runner ??
    createDeliveryRunner({
      registry,
      zaps,
      deliveries,
      githubFor,
      logger,
      scheduleTimers: false,
      random: () => 1,
      ...(options.now ? { now: options.now } : {}),
    });
  const users = createUsersRepository();
  const zapService = createZapService({
    registry,
    githubFor,
    secretBox,
    webhookUrl: (zapId) => `https://hooks.test/github?zap=${zapId}`,
  });

  const app = createApp({
    logger,
    readiness: () => ({ database: true, accepting: true }),
    appUrl: TEST_APP_URL,
    identity: unusedIdentity,
    users,
    sessions: createSessionStore(1),
    registry,
    zaps,
    deliveries,
    zapService,
    copilot: createCopilotService({
      models: {
        gemini: options.copilotModel ?? unusedCopilotModel('gemini'),
        openai: unusedCopilotModel('openai'),
        anthropic: unusedCopilotModel('anthropic'),
      },
      users,
      secretBox,
      registry,
      zaps: zapService,
      githubFor,
      pending: createPendingDrafts(),
      serverKey: options.serverCopilotKey,
    }),
    ...overrides,
    secretBox,
    githubFor,
    runner,
    events,
  });
  return { app, runner, secretBox, events };
}

export function buildTestApp(overrides: Partial<AppDependencies> = {}) {
  return createTestContext(overrides).app;
}

export function setCookies(response: Response): string[] {
  const value: unknown = response.headers['set-cookie'];
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}
