import type { Server } from 'node:http';
import { createApp } from './app.js';
import { createSessionStore } from './auth/session-store.js';
import { createGitHubIdentity, oauthScopes } from './github/github-identity.js';
import { connectDatabase, disconnectDatabase, isDatabaseConnected } from './platform/database.js';
import { loadEnv } from './platform/env.js';
import { createLogger } from './platform/logger.js';
import { createSecretBox } from './platform/secret-box.js';
import { createUsersRepository } from './users/users.repository.js';

const env = loadEnv(process.env);
const logger = createLogger(env.LOG_LEVEL);
let accepting = true;

await connectDatabase(env.MONGO_URL);

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
  users: createUsersRepository(),
  sessions: createSessionStore(env.SESSION_TTL_HOURS),
  secretBox: createSecretBox(env.ENCRYPTION_KEY),
});

const server = app.listen(env.PORT, () => {
  logger.info({ port: env.PORT }, 'api listening');
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

  await closeServer(server);
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
