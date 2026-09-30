import type { ConfigValues } from './zap.js';
import type { FieldMap } from '../template/fields.js';

export type DeliveryStatus = 'queued' | 'running' | 'retrying' | 'succeeded' | 'failed' | 'skipped';

export type DeliverySource = 'webhook' | 'test' | 'replay';

export interface DeliveryAttempt {
  number: number;
  startedAt: string;
  finishedAt: string;
  outcome: 'succeeded' | 'failed';
  error: string | null;
  retryable: boolean;
}

export interface DeliverySubject {
  label: string;
  url: string;
}

export const runFilters = ['runs', 'succeeded', 'failed', 'retrying', 'skipped'] as const;

export type RunFilter = (typeof runFilters)[number];

export const runRanges = ['24h', '7d', '30d', 'all'] as const;

export type RunRange = (typeof runRanges)[number];

export type RunCounts = Record<RunFilter, number>;

export interface RunPage {
  items: DeliveryDto[];
  nextCursor: string | null;
  counts: RunCounts;
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
  nextAttemptAt: string | null;
  replayOf: string | null;
  subject: DeliverySubject | null;
  receivedAt: string;
  completedAt: string | null;
}

export interface TestRunResult {
  source: 'latest-event' | 'sample';
  receivedAt: string | null;
  subject: DeliverySubject | null;
  trigger: { matched: true } | { matched: false; reason: string };
  fields: FieldMap;
  resolvedConfig: ConfigValues;
  missingFields: string[];
  problem: string | null;
}
