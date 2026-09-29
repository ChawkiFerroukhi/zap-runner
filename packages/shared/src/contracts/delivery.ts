import type { ConfigValues } from './zap.js';
import type { FieldMap } from '../template/fields.js';

export type DeliveryStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'skipped';

export type DeliverySource = 'webhook' | 'test' | 'replay';

export interface DeliveryAttempt {
  number: number;
  startedAt: string;
  finishedAt: string;
  outcome: 'succeeded' | 'failed';
  error: string | null;
  retryable: boolean;
}

export interface DeliveryDto {
  id: string;
  zapId: string;
  githubDeliveryId: string;
  source: DeliverySource;
  event: string;
  eventAction: string | null;
  status: DeliveryStatus;
  statusReason: string | null;
  fields: FieldMap | null;
  resolvedConfig: ConfigValues | null;
  missingFields: string[];
  result: Record<string, unknown> | null;
  attempts: DeliveryAttempt[];
  receivedAt: string;
  completedAt: string | null;
}
