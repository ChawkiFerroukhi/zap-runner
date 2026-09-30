import type { TestRunResult, ZapDto } from '@zap-runner/shared';
import type { DeliveriesRepository } from '../deliveries/deliveries.repository.js';
import { subjectOf } from '../deliveries/delivery-mapping.js';
import { HttpError } from '../http/errors.js';
import type { Registry } from '../integrations/registry.js';

const RECENT_EVENTS = 20;

export async function testRun(
  zap: ZapDto,
  userId: string,
  registry: Registry,
  deliveries: DeliveriesRepository,
): Promise<TestRunResult> {
  const trigger = registry.trigger(zap.trigger.type);
  const action = registry.action(zap.action.type);
  if (!trigger || !action) {
    throw new HttpError(
      422,
      'unavailable_step',
      'This Zap uses a trigger or action that is no longer available',
    );
  }

  const recent = await deliveries.recentPayloads(userId, zap.id, RECENT_EVENTS);
  for (const candidate of recent) {
    const evaluation = trigger.evaluate(candidate.payload, zap.trigger.config);
    if (evaluation.status === 'matched') {
      return {
        source: 'latest-event',
        receivedAt: candidate.receivedAt.toISOString(),
        subject: subjectOf(candidate.payload),
        trigger: { matched: true },
        fields: evaluation.fields,
        ...action.preview(zap.action.config, evaluation.fields),
      };
    }
  }

  const [latest] = recent;
  if (latest) {
    const evaluation = trigger.evaluate(latest.payload, zap.trigger.config);
    return {
      source: 'latest-event',
      receivedAt: latest.receivedAt.toISOString(),
      subject: subjectOf(latest.payload),
      trigger: {
        matched: false,
        reason: evaluation.status === 'skipped' ? evaluation.reason : 'No match',
      },
      fields: {},
      resolvedConfig: {},
      missingFields: [],
      problem: null,
    };
  }

  const fields = trigger.descriptor.sample;
  return {
    source: 'sample',
    receivedAt: null,
    subject: null,
    trigger: { matched: true },
    fields,
    ...action.preview(zap.action.config, fields),
  };
}
