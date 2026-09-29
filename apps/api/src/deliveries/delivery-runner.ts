import type { Logger } from 'pino';
import type { GitHubClientFactory } from '../github/github-client.js';
import type { Registry } from '../integrations/registry.js';
import type { ZapLookup } from '../zaps/zap-lookup.js';
import type { DeliveriesRepository, DeliveryOutcome } from './deliveries.repository.js';

export interface DeliveryRunner {
  enqueue(deliveryId: string): void;
  idle(): Promise<void>;
}

export interface DeliveryRunnerDependencies {
  registry: Registry;
  zaps: ZapLookup;
  deliveries: DeliveriesRepository;
  githubFor: GitHubClientFactory;
  logger: Logger;
}

function skipped(statusReason: string): DeliveryOutcome {
  return {
    status: 'skipped',
    statusReason,
    fields: null,
    resolvedConfig: null,
    missingFields: [],
    result: null,
    attempt: null,
  };
}

export function createDeliveryRunner(deps: DeliveryRunnerDependencies): DeliveryRunner {
  const inFlight = new Set<Promise<void>>();

  async function execute(deliveryId: string): Promise<DeliveryOutcome | null> {
    const delivery = await deps.deliveries.claim(deliveryId);
    if (!delivery) return null;
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

    const startedAt = new Date();
    const github = await deps.githubFor(zap.userId);
    const run = await action.run(zap.action.config, evaluation.fields, {
      zapId: zap.id,
      github,
      logger: log,
    });
    const finishedAt = new Date();
    const { result } = run;

    log.info(
      {
        outcome: result.ok ? 'succeeded' : 'failed',
        durationMs: finishedAt.getTime() - startedAt.getTime(),
      },
      result.ok ? result.summary : result.error,
    );

    return {
      status: result.ok ? 'succeeded' : 'failed',
      statusReason: result.ok ? result.summary : result.error,
      fields: evaluation.fields,
      resolvedConfig: run.resolvedConfig,
      missingFields: run.missingFields,
      result: result.ok ? result.data : null,
      attempt: {
        number: delivery.attempts + 1,
        startedAt,
        finishedAt,
        outcome: result.ok ? 'succeeded' : 'failed',
        error: result.ok ? null : result.error,
        retryable: !result.ok && result.retryable,
      },
    };
  }

  async function process(deliveryId: string): Promise<void> {
    try {
      const outcome = await execute(deliveryId);
      if (outcome) await deps.deliveries.finish(deliveryId, outcome);
    } catch (error) {
      deps.logger.error(
        { err: error, deliveryRecordId: deliveryId },
        'delivery processing crashed',
      );
      await deps.deliveries.finish(deliveryId, {
        ...skipped(error instanceof Error ? error.message : 'Unexpected error'),
        status: 'failed',
      });
    }
  }

  return {
    enqueue(deliveryId) {
      const task = process(deliveryId).finally(() => inFlight.delete(task));
      inFlight.add(task);
    },

    async idle() {
      await Promise.allSettled([...inFlight]);
    },
  };
}
