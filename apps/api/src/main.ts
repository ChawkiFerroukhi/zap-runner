import type { Server } from 'node:http';
import { createApp } from './app.js';
import { createSessionStore } from './auth/session-store.js';
import { createCopilotModels } from './copilot/copilot-providers.js';
import { createPendingDrafts } from './copilot/pending-drafts.js';
import { createCopilotService } from './copilot/copilot-service.js';
import { createDeliveriesRepository } from './deliveries/deliveries.repository.js';
import { createDeliveryEvents } from './deliveries/delivery-events.js';
import { createDeliveryRunner } from './deliveries/delivery-runner.js';
import { createGitHubClientFactory } from './github/github-client.js';
import { createGitHubIdentity, oauthScopes } from './github/github-identity.js';
import { registry } from './integrations/registry.js';
import { connectDatabase, disconnectDatabase, isDatabaseConnected } from './platform/database.js';
import { loadEnv } from './platform/env.js';
import { createLogger } from './platform/logger.js';
import { createSecretBox } from './platform/secret-box.js';
import { createUsersRepository } from './users/users.repository.js';
import { webhookUrlFor } from './zaps/webhook-url.js';
import { createZapLookup } from './zaps/zap-lookup.js';
import { createZapService } from './zaps/zap-service.js';

const env = loadEnv(process.env);
const logger = createLogger(env.LOG_LEVEL);
let accepting = true;

await connectDatabase(env.MONGO_URL);

const secretBox = createSecretBox(env.ENCRYPTION_KEY);
const users = createUsersRepository();
const githubFor = createGitHubClientFactory(users, secretBox);
const zaps = createZapLookup();
const events = createDeliveryEvents();
const deliveries = createDeliveriesRepository(events);
const runner = createDeliveryRunner({ registry, zaps, deliveries, githubFor, logger });
const zapService = createZapService({
  registry,
  githubFor,
  secretBox,
  webhookUrl: webhookUrlFor(env.WEBHOOK_PUBLIC_URL),
});

const app = createApp({
  logger,
  readiness: () => ({ database: isDatabaseConnected(), accepting }),
  appUrl: env.APP_URL,
  identity: createGitHubIdentity({
    clientId: env.GITHUB_CLIENT_ID,
    clientSecret: env.GITHUB_CLIENT_SECRET,
    callbackUrl: `${env.APP_URL}/api/auth/github/callback`,
    scopes: oauthScopes(env.GITHUB_REPO_ACCESS),
  }),
  users,
  sessions: createSessionStore(env.SESSION_TTL_HOURS),
  secretBox,
  registry,
  githubFor,
  zaps,
  deliveries,
  events,
  runner,
  zapService,
  copilot: createCopilotService({
    models: createCopilotModels({
      geminiModels: env.COPILOT_GEMINI_MODELS,
      openaiModel: env.COPILOT_OPENAI_MODEL,
      anthropicModel: env.COPILOT_ANTHROPIC_MODEL,
    }),
    users,
    secretBox,
    registry,
    zaps: zapService,
    githubFor,
    pending: createPendingDrafts(),
    serverKey: env.COPILOT_API_KEY
      ? { provider: env.COPILOT_PROVIDER, apiKey: env.COPILOT_API_KEY }
      : undefined,
  }),
});

const server = app.listen(env.PORT, () => {
  logger.info({ port: env.PORT }, 'api listening');
  runner.start();
});

function closeServer(target: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    target.close((error) => {
      if (error) reject(error);
      else resolve();
    });
    target.closeIdleConnections();
  });
}

async function shutdown(signal: NodeJS.Signals): Promise<void> {
  if (!accepting) return;
  accepting = false;
  logger.info({ signal }, 'shutting down');

  const forced = setTimeout(() => {
    logger.error('shutdown timed out');
    process.exit(1);
  }, env.SHUTDOWN_TIMEOUT_MS);
  forced.unref();

  events.close();
  await closeServer(server);
  await runner.stop();
  await disconnectDatabase();
  logger.info('shutdown complete');
  process.exit(0);
}

const signals: NodeJS.Signals[] = ['SIGTERM', 'SIGINT'];
for (const signal of signals) {
  process.once(signal, (received) => {
    void shutdown(received);
  });
}
