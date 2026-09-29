import { randomUUID } from 'node:crypto';
import express, { type Express } from 'express';
import type { Logger } from 'pino';
import { pinoHttp } from 'pino-http';
import { authRouter, type AuthRouterDependencies } from './auth/auth.router.js';
import { authenticate } from './auth/authenticate.js';
import { errorHandler, notFound } from './http/errors.js';
import { healthRouter, type ReadinessChecks } from './http/health.js';
import { requireSameOrigin } from './http/same-origin.js';

export interface AppDependencies extends AuthRouterDependencies {
  logger: Logger;
  readiness: ReadinessChecks;
}

export function createApp(deps: AppDependencies): Express {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 'loopback, uniquelocal');

  app.use(
    pinoHttp({
      logger: deps.logger,
      genReqId: (req, res) => {
        const delivery = req.headers['x-github-delivery'];
        const id = typeof delivery === 'string' ? delivery : randomUUID();
        res.setHeader('x-request-id', id);
        return id;
      },
    }),
  );

  app.use('/api', healthRouter(deps.readiness));

  const api = express.Router();
  api.use(requireSameOrigin(deps.appUrl));
  api.use(express.json({ limit: '100kb' }));
  api.use(authenticate(deps.sessions, deps.users));
  api.use('/auth', authRouter(deps));
  app.use('/api', api);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
