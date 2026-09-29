import { Router } from 'express';
import type { Readiness } from '@zap-runner/shared';

export type ReadinessChecks = () => Readiness['checks'];

export function healthRouter(checks: ReadinessChecks): Router {
  const router = Router();

  router.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  router.get('/ready', (_req, res) => {
    const current = checks();
    const ready = current.database && current.accepting;
    const body: Readiness = { status: ready ? 'ready' : 'not_ready', checks: current };
    res.status(ready ? 200 : 503).json(body);
  });

  return router;
}
