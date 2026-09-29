import { randomUUID } from 'node:crypto';
import express, { type Express } from 'express';
import type { Logger } from 'pino';
import { pinoHttp } from 'pino-http';
import { errorHandler, notFound } from './http/errors.js';
import { healthRouter, type ReadinessChecks } from './http/health.js';

export interface AppDependencies {
  logger: Logger;
  readiness: ReadinessChecks;
}

export function createApp({ logger, readiness }: AppDependencies): Express {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 'loopback, uniquelocal');

  app.use(
    pinoHttp({
      logger,
      genReqId: (req, res) => {
        const delivery = req.headers['x-github-delivery'];
        const id = typeof delivery === 'string' ? delivery : randomUUID();
        res.setHeader('x-request-id', id);
        return id;
      },
    }),
  );

  app.use('/api', healthRouter(readiness));
  app.use(notFound);
  app.use(errorHandler);

  return app;
}
