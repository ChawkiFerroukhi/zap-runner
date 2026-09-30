import {
  configValuesSchema,
  type DeliveryAttempt,
  type DeliveryDto,
  type DeliverySource,
  type DeliveryStatus,
  type DeliverySubject,
  type FieldMap,
} from '@zap-runner/shared';
import { z } from 'zod';

const fieldMapSchema = z.record(
  z.string(),
  z.union([z.string(), z.number(), z.boolean(), z.null()]),
);
const resultSchema = z.record(z.string(), z.unknown());

const linked = z.object({
  number: z.number().optional(),
  html_url: z.string().startsWith('https://'),
});
const subjectSchema = z.object({
  pull_request: linked.optional(),
  issue: linked.extend({ pull_request: z.unknown().optional() }).optional(),
  comment: linked.optional(),
});

export function subjectOf(payload: unknown): DeliverySubject | null {
  const parsed = subjectSchema.safeParse(payload);
  if (!parsed.success) return null;
  const { pull_request: pullRequest, issue } = parsed.data;
  if (pullRequest)
    return { label: `PR #${String(pullRequest.number ?? '')}`, url: pullRequest.html_url };
  if (issue) {
    const kind = issue.pull_request === undefined ? 'Issue' : 'PR';
    return { label: `${kind} #${String(issue.number ?? '')}`, url: issue.html_url };
  }
  return null;
}

export interface StoredAttempt {
  number: number;
  startedAt: Date;
  finishedAt: Date;
  outcome: 'succeeded' | 'failed';
  error?: string | null | undefined;
  retryable: boolean;
}

export interface StoredDelivery {
  _id: { toString(): string };
  zapId: { toString(): string };
  githubDeliveryId: string;
  source: DeliverySource;
  event: string;
  eventAction?: string | null | undefined;
  status: DeliveryStatus;
  statusReason?: string | null | undefined;
  fields?: unknown;
  resolvedConfig?: unknown;
  missingFields: string[];
  result?: unknown;
  attempts: StoredAttempt[];
  nextAttemptAt?: Date | null | undefined;
  replayOf?: { toString(): string } | null | undefined;
  receivedAt: Date;
  completedAt?: Date | null | undefined;
  payload?: unknown;
}

function toAttempt(attempt: StoredAttempt): DeliveryAttempt {
  return {
    number: attempt.number,
    startedAt: attempt.startedAt.toISOString(),
    finishedAt: attempt.finishedAt.toISOString(),
    outcome: attempt.outcome,
    error: attempt.error ?? null,
    retryable: attempt.retryable,
  };
}

function nullable<T>(schema: z.ZodType<T>, value: unknown): T | null {
  const parsed = schema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function toFieldMap(value: unknown): FieldMap | null {
  return nullable(fieldMapSchema, value);
}

export function toDeliveryDto(delivery: StoredDelivery): DeliveryDto {
  return {
    id: delivery._id.toString(),
    zapId: delivery.zapId.toString(),
    githubDeliveryId: delivery.githubDeliveryId,
    source: delivery.source,
    event: delivery.event,
    eventAction: delivery.eventAction ?? null,
    status: delivery.status,
    statusReason: delivery.statusReason ?? null,
    fields: toFieldMap(delivery.fields),
    resolvedConfig: nullable(configValuesSchema, delivery.resolvedConfig),
    missingFields: delivery.missingFields,
    result: nullable(resultSchema, delivery.result),
    attempts: delivery.attempts.map(toAttempt),
    nextAttemptAt: delivery.nextAttemptAt?.toISOString() ?? null,
    replayOf: delivery.replayOf?.toString() ?? null,
    subject: subjectOf(delivery.payload),
    receivedAt: delivery.receivedAt.toISOString(),
    completedAt: delivery.completedAt?.toISOString() ?? null,
  };
}
