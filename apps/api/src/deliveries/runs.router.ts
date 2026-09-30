import { Router } from 'express';
import { z } from 'zod';
import { currentAuth, requireAuth } from '../auth/authenticate.js';
import { parseQuery } from '../http/errors.js';
import type { ZapService } from '../zaps/zap-service.js';
import { runQuerySchema } from '../zaps/zaps.router.js';
import type { DeliveriesRepository } from './deliveries.repository.js';
import type { DeliveryEvents } from './delivery-events.js';
import { streamDeliveries } from './delivery-stream.js';

const allRunsQuerySchema = runQuerySchema.extend({ zapId: z.string().max(64).optional() });

export interface RunsRouterDependencies {
  zaps: ZapService;
  deliveries: DeliveriesRepository;
  events: DeliveryEvents;
}

export function runsRouter({ zaps, deliveries, events }: RunsRouterDependencies): Router {
  const router = Router();
  router.use(requireAuth);

  router.get('/', async (req, res) => {
    const userId = currentAuth(req).user.id;
    const query = parseQuery(allRunsQuerySchema, req.query);
    const zapId = query.zapId ? (await zaps.get(userId, query.zapId)).id : null;
    res.json(await deliveries.page(userId, zapId, { ...query, cursor: query.cursor ?? null }));
  });

  router.get('/events', (req, res) => {
    streamDeliveries(req, res, events, { userId: currentAuth(req).user.id, zapId: null });
  });

  return router;
}
