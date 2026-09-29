import type { Octokit } from '@octokit/rest';
import type {
  ActionDescriptor,
  ConfigField,
  ConfigValues,
  FieldMap,
  OutputField,
  TriggerDescriptor,
} from '@zap-runner/shared';
import type { Logger } from 'pino';
import type { z } from 'zod';

export interface RepositoryRef {
  owner: string;
  name: string;
  fullName: string;
}

export type FieldErrors = Record<string, string>;

export type TriggerMatch = { matched: true } | { matched: false; reason: string };

export interface TriggerDefinition<
  Config extends { repository: string },
  Event,
  Output extends FieldMap,
> {
  id: string;
  appId: string;
  name: string;
  description: string;
  webhookEvent: string;
  configFields: ConfigField[];
  config: z.ZodType<Config>;
  payload: z.ZodType<Event>;
  outputFields: (OutputField & { key: keyof Output & string })[];
  mappingHints?: Record<string, string>;
  sample: Event;
  match(event: Event, config: Config): TriggerMatch;
  extract(event: Event): Output;
}

export type TriggerEvaluation =
  { status: 'matched'; fields: FieldMap } | { status: 'skipped'; reason: string };

export type ParsedTriggerConfig =
  { ok: true; repository: RepositoryRef } | { ok: false; errors: FieldErrors };

export interface Trigger {
  descriptor: TriggerDescriptor;
  webhookEvent: string;
  parseConfig(raw: ConfigValues): ParsedTriggerConfig;
  evaluate(payload: unknown, config: ConfigValues): TriggerEvaluation;
}

export interface ActionContext {
  zapId: string;
  github: Octokit;
  logger: Logger;
}

export type ActionResult =
  | { ok: true; summary: string; data: Record<string, unknown> }
  | { ok: false; retryable: boolean; error: string };

export interface ActionDefinition<Config> {
  id: string;
  appId: string;
  name: string;
  description: string;
  configFields: ConfigField[];
  config: z.ZodType<Config>;
  execute(config: Config, context: ActionContext): Promise<ActionResult>;
}

export interface ActionRun {
  resolvedConfig: ConfigValues;
  missingFields: string[];
  result: ActionResult;
}

export interface Action {
  descriptor: ActionDescriptor;
  run(config: ConfigValues, fields: FieldMap, context: ActionContext): Promise<ActionRun>;
}
