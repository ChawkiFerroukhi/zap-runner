import { zapInputSchema } from '@zap-runner/shared';
import { Router } from 'express';
import { currentAuth, requireAuth } from '../auth/authenticate.js';
import type { DeliveriesRepository } from '../deliveries/deliveries.repository.js';
import { parseBody } from '../http/errors.js';
import type { ZapService } from './zap-service.js';

const DELIVERY_PAGE_SIZE = 50;

export function zapsRouter(zaps: ZapService, deliveries: DeliveriesRepository): Router {
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

  router.delete('/:zapId', async (req, res) => {
    await zaps.remove(currentAuth(req).user.id, req.params.zapId);
    res.status(204).end();
  });

  router.get('/:zapId/deliveries', async (req, res) => {
    const userId = currentAuth(req).user.id;
    const zap = await zaps.get(userId, req.params.zapId);
    res.json(await deliveries.listForZap(userId, zap.id, DELIVERY_PAGE_SIZE));
  });

  return router;
}
