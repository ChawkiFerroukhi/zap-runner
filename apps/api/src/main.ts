import type { Server } from 'node:http';
import { createApp } from './app.js';
import { connectDatabase, disconnectDatabase, isDatabaseConnected } from './platform/database.js';
import { loadEnv } from './platform/env.js';
import { createLogger } from './platform/logger.js';

const env = loadEnv(process.env);
const logger = createLogger(env.LOG_LEVEL);
let accepting = true;

await connectDatabase(env.MONGO_URL);

const app = createApp({
  logger,
  readiness: () => ({ database: isDatabaseConnected(), accepting }),
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
