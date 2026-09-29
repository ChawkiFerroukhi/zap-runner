import {
  configValuesSchema,
  type DeliveryAttempt,
  type DeliveryDto,
  type DeliverySource,
  type DeliveryStatus,
  type FieldMap,
} from '@zap-runner/shared';
import { z } from 'zod';

const fieldMapSchema = z.record(
  z.string(),
  z.union([z.string(), z.number(), z.boolean(), z.null()]),
);
const resultSchema = z.record(z.string(), z.unknown());

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
  receivedAt: Date;
  completedAt?: Date | null | undefined;
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
    receivedAt: delivery.receivedAt.toISOString(),
    completedAt: delivery.completedAt?.toISOString() ?? null,
  };
}
