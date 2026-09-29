import type { TriggerSample } from '@zap-runner/shared';
import { Router } from 'express';
import { currentAuth, requireAuth } from '../auth/authenticate.js';
import type { DeliveriesRepository } from '../deliveries/deliveries.repository.js';
import { notFoundError } from '../http/errors.js';
import type { ZapService } from '../zaps/zap-service.js';
import type { Registry } from './registry.js';

export function triggersRouter(
  registry: Registry,
  zaps: ZapService,
  deliveries: DeliveriesRepository,
): Router {
  const router = Router();
  router.use(requireAuth);

  router.get('/:triggerId/sample', async (req, res) => {
    const trigger = registry.trigger(req.params.triggerId);
    if (!trigger) throw notFoundError('Trigger');
    const userId = currentAuth(req).user.id;
    const zapIds = (await zaps.list(userId))
      .filter((zap) => zap.trigger.type === trigger.descriptor.id)
      .map((zap) => zap.id);
    const latest = await deliveries.latestFields(userId, zapIds);
    const sample: TriggerSample = latest
      ? {
          source: 'latest-event',
          receivedAt: latest.receivedAt.toISOString(),
          fields: latest.fields,
        }
      : { source: 'sample', receivedAt: null, fields: trigger.descriptor.sample };
    res.json(sample);
  });

  return router;
}
