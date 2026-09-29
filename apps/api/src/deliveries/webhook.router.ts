import express, { Router } from 'express';
import { z } from 'zod';
import { HttpError } from '../http/errors.js';
import type { SecretBox } from '../platform/secret-box.js';
import type { ZapLookup } from '../zaps/zap-lookup.js';
import type { DeliveriesRepository } from './deliveries.repository.js';
import type { DeliveryRunner } from './delivery-runner.js';
import { signatureMatches } from './signature.js';

const headersSchema = z.object({
  'x-github-hook-id': z.coerce.number().int().positive(),
  'x-github-event': z.string().min(1),
  'x-github-delivery': z.string().min(1),
  'x-hub-signature-256': z.string().startsWith('sha256='),
});

export interface WebhookRouterDependencies {
  zaps: ZapLookup;
  deliveries: DeliveriesRepository;
  runner: DeliveryRunner;
  secretBox: SecretBox;
}

function parseJson(body: Buffer): unknown {
  try {
    const parsed: unknown = JSON.parse(body.toString('utf8'));
    return parsed;
  } catch {
    throw new HttpError(400, 'invalid_json', 'Webhook body is not valid JSON');
  }
}

export function webhookRouter(deps: WebhookRouterDependencies): Router {
  const router = Router();

  router.post('/github', express.raw({ type: () => true, limit: '1mb' }), async (req, res) => {
    const headers = headersSchema.safeParse(req.headers);
    if (!headers.success) {
      throw new HttpError(400, 'invalid_headers', 'Missing or malformed GitHub webhook headers');
    }
    const body: unknown = req.body;
    if (!Buffer.isBuffer(body)) throw new HttpError(400, 'invalid_body', 'Expected a raw body');

    const hookId = headers.data['x-github-hook-id'];
    const zap = await deps.zaps.byHookId(hookId);
    if (!zap) throw new HttpError(404, 'unknown_hook', 'No Zap owns this webhook');

    const secret = deps.secretBox.open(zap.sealedSecret);
    if (!signatureMatches(body, secret, headers.data['x-hub-signature-256'])) {
      req.log.warn({ hookId, zapId: zap.id }, 'webhook signature rejected');
      throw new HttpError(401, 'invalid_signature', 'Signature does not match');
    }

    const event = headers.data['x-github-event'];
    if (event === 'ping') {
      await deps.zaps.markWebhookVerified(zap.id);
      res.status(200).json({ status: 'pong' });
      return;
    }

    const deliveryId = await deps.deliveries.record({
      zapId: zap.id,
      userId: zap.userId,
      githubDeliveryId: headers.data['x-github-delivery'],
      source: 'webhook',
      event,
      payload: parseJson(body),
    });
    if (!deliveryId) {
      req.log.info({ zapId: zap.id }, 'duplicate delivery ignored');
      res.status(200).json({ status: 'duplicate' });
      return;
    }

    res.status(202).json({ status: 'accepted', deliveryId });
    deps.runner.enqueue(deliveryId);
  });

  return router;
}
