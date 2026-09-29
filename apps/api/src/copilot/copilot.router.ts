import {
  copilotDraftInputSchema,
  copilotKeyInputSchema,
  type CopilotEvent,
} from '@zap-runner/shared';
import { Router } from 'express';
import { currentAuth, requireAuth } from '../auth/authenticate.js';
import { HttpError, parseBody } from '../http/errors.js';
import { CopilotCancelled, type CopilotService } from './copilot-service.js';

export function copilotRouter(copilot: CopilotService): Router {
  const router = Router();
  router.use(requireAuth);

  router.get('/status', async (req, res) => {
    res.json(await copilot.status(currentAuth(req).user.id));
  });

  router.put('/key', async (req, res) => {
    const { provider, apiKey } = parseBody(copilotKeyInputSchema, req.body);
    res.json(await copilot.saveKey(currentAuth(req).user.id, provider, apiKey));
  });

  router.delete('/key', async (req, res) => {
    res.json(await copilot.removeKey(currentAuth(req).user.id));
  });

  router.post('/drafts', async (req, res) => {
    const input = parseBody(copilotDraftInputSchema, req.body);
    const userId = currentAuth(req).user.id;
    if (!(await copilot.status(userId)).configured) {
      throw new HttpError(
        409,
        'copilot_not_configured',
        'Add a Copilot API key in Settings to draft Zaps',
      );
    }

    res.status(200).set({
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
      'x-accel-buffering': 'no',
    });
    res.flushHeaders();

    const cancellation = new AbortController();
    res.on('close', () => {
      if (!res.writableEnded) cancellation.abort();
    });

    const emit = (event: CopilotEvent): void => {
      if (cancellation.signal.aborted) return;
      if (event.type === 'drafted')
        req.log.info({ zapId: event.zap.id, model: event.model }, 'copilot drafted a zap');
      res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
    };

    try {
      await copilot.draft(userId, input, emit, cancellation.signal);
    } catch (error) {
      if (error instanceof CopilotCancelled) {
        req.log.info('copilot draft cancelled by the client');
      } else if (error instanceof HttpError) {
        emit({ type: 'failed', code: error.code, message: error.message });
      } else {
        req.log.error({ err: error }, 'copilot draft crashed');
        emit({ type: 'failed', code: 'internal', message: 'Something went wrong while drafting' });
      }
    }
    res.end();
  });

  return router;
}
