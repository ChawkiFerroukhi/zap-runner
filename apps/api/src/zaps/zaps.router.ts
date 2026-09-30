import { runFilters, runRanges, zapInputSchema } from '@zap-runner/shared';
import { z } from 'zod';
import { Router } from 'express';
import { currentAuth, requireAuth } from '../auth/authenticate.js';
import type { DeliveriesRepository } from '../deliveries/deliveries.repository.js';
import type { DeliveryEvents } from '../deliveries/delivery-events.js';
import type { DeliveryRunner } from '../deliveries/delivery-runner.js';
import { streamDeliveries } from '../deliveries/delivery-stream.js';
import type { Registry } from '../integrations/registry.js';
import { notFoundError, parseBody, parseQuery } from '../http/errors.js';
import { testRun } from './test-run.js';
import type { ZapService } from './zap-service.js';

export const runQuerySchema = z.object({
  filter: z.enum(runFilters).default('runs'),
  range: z.enum(runRanges).default('7d'),
  cursor: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

export interface ZapsRouterDependencies {
  zaps: ZapService;
  deliveries: DeliveriesRepository;
  events: DeliveryEvents;
  runner: DeliveryRunner;
  registry: Registry;
}

export function zapsRouter({
  zaps,
  deliveries,
  events,
  runner,
  registry,
}: ZapsRouterDependencies): Router {
  const router = Router();
  router.use(requireAuth);

  router.get('/', async (req, res) => {
    res.json(await zaps.list(currentAuth(req).user.id));
  });

  router.post('/', async (req, res) => {
    const input = parseBody(zapInputSchema, req.body);
    res.status(201).json(await zaps.create(currentAuth(req).user.id, input));
  });

  router.get('/:zapId', async (req, res) => {
    res.json(await zaps.get(currentAuth(req).user.id, req.params.zapId));
  });

  router.put('/:zapId', async (req, res) => {
    const input = parseBody(zapInputSchema, req.body);
    res.json(await zaps.update(currentAuth(req).user.id, req.params.zapId, input));
  });

  router.post('/:zapId/enable', async (req, res) => {
    res.json(await zaps.enable(currentAuth(req).user.id, req.params.zapId));
  });

  router.post('/:zapId/disable', async (req, res) => {
    res.json(await zaps.disable(currentAuth(req).user.id, req.params.zapId));
  });

  router.post('/:zapId/duplicate', async (req, res) => {
    res.status(201).json(await zaps.duplicate(currentAuth(req).user.id, req.params.zapId));
  });

  router.delete('/:zapId', async (req, res) => {
    await zaps.remove(currentAuth(req).user.id, req.params.zapId);
    res.status(204).end();
  });

  router.get('/:zapId/deliveries', async (req, res) => {
    const userId = currentAuth(req).user.id;
    const zap = await zaps.get(userId, req.params.zapId);
    const query = parseQuery(runQuerySchema, req.query);
    res.json(await deliveries.page(userId, zap.id, { ...query, cursor: query.cursor ?? null }));
  });

  router.get('/:zapId/deliveries/:deliveryId/payload', async (req, res) => {
    const userId = currentAuth(req).user.id;
    const zap = await zaps.get(userId, req.params.zapId);
    const found = await deliveries.payloadOf(userId, zap.id, req.params.deliveryId);
    if (!found) throw notFoundError('Run');
    res.json(found);
  });

  router.post('/:zapId/deliveries/:deliveryId/replay', async (req, res) => {
    const userId = currentAuth(req).user.id;
    const zap = await zaps.get(userId, req.params.zapId);
    const original = await deliveries.findOwned(userId, req.params.deliveryId);
    if (original?.zapId !== zap.id) throw notFoundError('Run');
    const deliveryId = await deliveries.replay(userId, original.id);
    if (!deliveryId) throw notFoundError('Run');
    runner.enqueue(deliveryId);
    res.status(202).json({ deliveryId });
  });

  router.post('/:zapId/test', async (req, res) => {
    const userId = currentAuth(req).user.id;
    const zap = await zaps.get(userId, req.params.zapId);
    res.json(await testRun(zap, userId, registry, deliveries));
  });

  router.get('/:zapId/events', async (req, res) => {
    const userId = currentAuth(req).user.id;
    const zap = await zaps.get(userId, req.params.zapId);
    streamDeliveries(req, res, events, { userId, zapId: zap.id });
  });

  return router;
}
