import { randomUUID } from 'node:crypto';
import express, { type Express } from 'express';
import type { Logger } from 'pino';
import { pinoHttp } from 'pino-http';
import { authRouter, type AuthRouterDependencies } from './auth/auth.router.js';
import { authenticate, requireAuth } from './auth/authenticate.js';
import { copilotRouter } from './copilot/copilot.router.js';
import type { CopilotService } from './copilot/copilot-service.js';
import type { DeliveriesRepository } from './deliveries/deliveries.repository.js';
import type { DeliveryEvents } from './deliveries/delivery-events.js';
import { runsRouter } from './deliveries/runs.router.js';
import { webhookRouter, type WebhookRouterDependencies } from './deliveries/webhook.router.js';
import type { GitHubClientFactory } from './github/github-client.js';
import { repositoriesRouter } from './github/repositories.router.js';
import { errorHandler, notFound } from './http/errors.js';
import { healthRouter, type ReadinessChecks } from './http/health.js';
import { DEFAULT_RATE_LIMITS, limiter, type RateLimits } from './http/rate-limit.js';
import { requireSameOrigin } from './http/same-origin.js';
import type { Registry } from './integrations/registry.js';
import { triggersRouter } from './integrations/triggers.router.js';
import type { ZapService } from './zaps/zap-service.js';
import { zapsRouter } from './zaps/zaps.router.js';

export interface AppDependencies extends AuthRouterDependencies, WebhookRouterDependencies {
  logger: Logger;
  readiness: ReadinessChecks;
  registry: Registry;
  zapService: ZapService;
  copilot: CopilotService;
  deliveries: DeliveriesRepository;
  events: DeliveryEvents;
  githubFor: GitHubClientFactory;
  rateLimits?: RateLimits;
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
  const limits = deps.rateLimits ?? DEFAULT_RATE_LIMITS;

  app.use('/webhooks', limiter(limits.webhooks), webhookRouter(deps));

  const api = express.Router();
  api.use(requireSameOrigin(deps.appUrl));
  api.use(express.json({ limit: '100kb' }));
  api.use(authenticate(deps.sessions, deps.users));
  api.use(
    '/auth/github',
    limiter(limits.signIn, {
      onLimited: (_req, res) => {
        res.redirect(`${deps.appUrl}/sign-in?error=rate_limited`);
      },
    }),
  );
  api.post('/copilot/drafts', limiter(limits.copilotDrafts));
  api.use(limiter(limits.writes, { onlyWrites: true }));
  api.use('/auth', authRouter(deps));
  api.get('/registry', requireAuth, (_req, res) => {
    res.json(deps.registry.describe());
  });
  api.use('/github', repositoriesRouter(deps.githubFor));
  api.use('/triggers', triggersRouter(deps.registry, deps.zapService, deps.deliveries));
  api.use('/copilot', copilotRouter(deps.copilot));
  api.use(
    '/runs',
    runsRouter({ zaps: deps.zapService, deliveries: deps.deliveries, events: deps.events }),
  );
  api.use(
    '/zaps',
    zapsRouter({
      zaps: deps.zapService,
      deliveries: deps.deliveries,
      events: deps.events,
      runner: deps.runner,
      registry: deps.registry,
    }),
  );
  app.use('/api', api);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
