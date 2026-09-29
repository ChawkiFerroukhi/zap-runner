import type { ConfigField, ConfigValues, FieldMap } from '@zap-runner/shared';
import { resolveTemplate } from '@zap-runner/shared';
import { z } from 'zod';
import type {
  Action,
  ActionDefinition,
  FieldErrors,
  RepositoryRef,
  Trigger,
  TriggerDefinition,
} from './definitions.js';

const REPOSITORY_PATTERN = /^([\w.-]+)\/([\w.-]+)$/;

export const repositoryName = z
  .string()
  .trim()
  .regex(REPOSITORY_PATTERN, 'Use the owner/name form, for example octocat/hello-world');

export function toRepositoryRef(fullName: string): RepositoryRef | null {
  const match = REPOSITORY_PATTERN.exec(fullName.trim());
  if (!match?.[1] || !match[2]) return null;
  return { owner: match[1], name: match[2], fullName: `${match[1]}/${match[2]}` };
}

export function fieldErrors(error: z.ZodError): FieldErrors {
  const errors: FieldErrors = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.') || 'config';
    errors[key] ??= issue.message;
  }
  return errors;
}

export function isTemplateField(field: ConfigField): boolean {
  return field.kind === 'template' || field.kind === 'multiline-template';
}

export function defineTrigger<
  Config extends { repository: string },
  Event,
  Output extends FieldMap,
>(definition: TriggerDefinition<Config, Event, Output>): Trigger {
  return {
    descriptor: {
      id: definition.id,
      appId: definition.appId,
      name: definition.name,
      description: definition.description,
      configFields: definition.configFields,
      outputFields: definition.outputFields,
      sample: definition.extract(definition.sample),
    },
    webhookEvent: definition.webhookEvent,

    parseConfig(raw) {
      const parsed = definition.config.safeParse(raw);
      if (!parsed.success) return { ok: false, errors: fieldErrors(parsed.error) };
      const repository = toRepositoryRef(parsed.data.repository);
      if (!repository) return { ok: false, errors: { repository: 'Invalid repository' } };
      return { ok: true, repository };
    },

    evaluate(payload, rawConfig) {
      const event = definition.payload.safeParse(payload);
      if (!event.success) {
        return {
          status: 'skipped',
          reason: 'Payload does not have the shape this trigger expects',
        };
      }
      const config = definition.config.safeParse(rawConfig);
      if (!config.success) return { status: 'skipped', reason: 'Zap trigger settings are invalid' };
      const match = definition.match(event.data, config.data);
      if (!match.matched) return { status: 'skipped', reason: match.reason };
      return { status: 'matched', fields: definition.extract(event.data) };
    },
  };
}

function resolveConfig(
  fields: ConfigField[],
  config: ConfigValues,
  values: FieldMap,
): { resolved: ConfigValues; missing: string[] } {
  const resolved: ConfigValues = { ...config };
  const missing = new Set<string>();
  for (const field of fields) {
    const raw = config[field.key];
    if (!isTemplateField(field) || typeof raw !== 'string') continue;
    const result = resolveTemplate(raw, values);
    resolved[field.key] = result.output;
    result.missing.forEach((key) => missing.add(key));
  }
  return { resolved, missing: [...missing] };
}

export function defineAction<Config>(definition: ActionDefinition<Config>): Action {
  return {
    descriptor: {
      id: definition.id,
      appId: definition.appId,
      name: definition.name,
      description: definition.description,
      configFields: definition.configFields,
    },

    async run(config, values, context) {
      const { resolved, missing } = resolveConfig(definition.configFields, config, values);
      const parsed = definition.config.safeParse(resolved);
      if (!parsed.success) {
        const details = Object.entries(fieldErrors(parsed.error))
          .map(([key, message]) => `${key}: ${message}`)
          .join('; ');
        return {
          resolvedConfig: resolved,
          missingFields: missing,
          result: {
            ok: false,
            retryable: false,
            error: `Settings invalid after mapping (${details})`,
          },
        };
      }
      return {
        resolvedConfig: resolved,
        missingFields: missing,
        result: await definition.execute(parsed.data, context),
      };
    },
  };
}
