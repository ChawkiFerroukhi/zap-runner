import type { Logger } from 'pino';
import type { GitHubClientFactory } from '../github/github-client.js';
import type { Registry } from '../integrations/registry.js';
import type { ZapLookup } from '../zaps/zap-lookup.js';
import type {
  ClaimedDelivery,
  DeliveriesRepository,
  DeliveryOutcome,
} from './deliveries.repository.js';
import {
  DEFAULT_RETRY_POLICY,
  retryDelayMs,
  shouldRetry,
  type RetryPolicy,
} from './retry-policy.js';

export interface DeliveryRunner {
  start(): void;
  enqueue(deliveryId: string): void;
  drainNow(): Promise<void>;
  idle(): Promise<void>;
  stop(): Promise<void>;
}

export interface DeliveryRunnerDependencies {
  registry: Registry;
  zaps: ZapLookup;
  deliveries: DeliveriesRepository;
  githubFor: GitHubClientFactory;
  logger: Logger;
  policy?: RetryPolicy;
  now?: () => Date;
  random?: () => number;
  leaseMs?: number;
  scheduleTimers?: boolean;
}

const DEFAULT_LEASE_MS = 60_000;
const MAX_TIMER_MS = 2 ** 31 - 1;

function skipped(statusReason: string): DeliveryOutcome {
  return {
    status: 'skipped',
    statusReason,
    fields: null,
    resolvedConfig: null,
    missingFields: [],
    result: null,
    attempt: null,
    nextAttemptAt: null,
  };
}

export function createDeliveryRunner(deps: DeliveryRunnerDependencies): DeliveryRunner {
  const policy = deps.policy ?? DEFAULT_RETRY_POLICY;
  const now = deps.now ?? (() => new Date());
  const leaseMs = deps.leaseMs ?? DEFAULT_LEASE_MS;
  const scheduleTimers = deps.scheduleTimers ?? true;
  let draining: Promise<void> | null = null;
  let drainAgain = false;
  let timer: NodeJS.Timeout | null = null;
  let stopped = false;
  const isStopped = (): boolean => stopped;

  async function execute(delivery: ClaimedDelivery): Promise<DeliveryOutcome> {
    const log = deps.logger.child({ deliveryId: delivery.githubDeliveryId, zapId: delivery.zapId });

    const zap = await deps.zaps.byId(delivery.zapId);
    if (!zap?.enabled) return skipped('Zap is turned off');

    const trigger = deps.registry.trigger(zap.trigger.type);
    const action = deps.registry.action(zap.action.type);
    if (!trigger || !action)
      return skipped('Zap uses a trigger or action that is no longer available');

    const evaluation = trigger.evaluate(delivery.payload, zap.trigger.config);
    if (evaluation.status === 'skipped') {
      log.info({ reason: evaluation.reason }, 'trigger did not match');
      return skipped(evaluation.reason);
    }

    const startedAt = now();
    const github = await deps.githubFor(zap.userId);
    const run = await action.run(zap.action.config, evaluation.fields, {
      zapId: zap.id,
      github,
      logger: log,
    });
    const finishedAt = now();
    const { result } = run;
    const attemptNumber = delivery.attempts + 1;
    const retry = !result.ok && shouldRetry(policy, attemptNumber, result.retryable);
    const nextAttemptAt = retry
      ? new Date(finishedAt.getTime() + retryDelayMs(policy, attemptNumber, deps.random))
      : null;

    log.info(
      {
        outcome: result.ok ? 'succeeded' : retry ? 'retrying' : 'failed',
        attempt: attemptNumber,
        durationMs: finishedAt.getTime() - startedAt.getTime(),
      },
      result.ok ? result.summary : result.error,
    );

    const statusReason = result.ok
      ? result.summary
      : nextAttemptAt
        ? `${result.error}. Retrying in ${String(Math.round((nextAttemptAt.getTime() - finishedAt.getTime()) / 1000))} s (attempt ${String(attemptNumber + 1)} of ${String(policy.maxAttempts)})`
        : result.error;

    return {
      status: result.ok ? 'succeeded' : retry ? 'retrying' : 'failed',
      statusReason,
      fields: evaluation.fields,
      resolvedConfig: run.resolvedConfig,
      missingFields: run.missingFields,
      result: result.ok ? result.data : null,
      attempt: {
        number: attemptNumber,
        startedAt,
        finishedAt,
        outcome: result.ok ? 'succeeded' : 'failed',
        error: result.ok ? null : result.error,
        retryable: !result.ok && result.retryable,
      },
      nextAttemptAt,
    };
  }

  async function process(delivery: ClaimedDelivery): Promise<void> {
    try {
      await deps.deliveries.finish(delivery.id, await execute(delivery));
    } catch (error) {
      deps.logger.error(
        { err: error, deliveryRecordId: delivery.id },
        'delivery processing crashed',
      );
      await deps.deliveries.finish(delivery.id, {
        ...skipped(error instanceof Error ? error.message : 'Unexpected error'),
        status: 'failed',
      });
    }
  }

  async function drain(): Promise<void> {
    while (!stopped) {
      const claimed = await deps.deliveries.claimNext(now(), leaseMs);
      if (!claimed) return;
      await process(claimed);
    }
  }

  async function scheduleNext(): Promise<void> {
    if (!scheduleTimers || stopped) return;
    if (timer) clearTimeout(timer);
    timer = null;
    const due = await deps.deliveries.nextDueAt();
    if (!due || isStopped()) return;
    const delay = Math.min(MAX_TIMER_MS, Math.max(0, due.getTime() - now().getTime()));
    timer = setTimeout(kick, delay);
    timer.unref();
  }

  function kick(): void {
    if (stopped) return;
    if (draining) {
      drainAgain = true;
      return;
    }
    draining = drain()
      .catch((error: unknown) => {
        deps.logger.error({ err: error }, 'delivery worker failed to drain');
      })
      .finally(() => {
        draining = null;
        if (drainAgain) {
          drainAgain = false;
          kick();
        } else {
          void scheduleNext();
        }
      });
  }

  async function idle(): Promise<void> {
    while (draining) await draining;
  }

  return {
    start: kick,
    enqueue: () => {
      kick();
    },
    async drainNow() {
      kick();
      await idle();
    },
    idle,
    async stop() {
      stopped = true;
      if (timer) clearTimeout(timer);
      timer = null;
      await idle();
    },
  };
}
