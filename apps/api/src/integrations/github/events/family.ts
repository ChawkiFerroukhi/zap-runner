import type { FieldMap, FieldValue, OutputField } from '@zap-runner/shared';
import { z } from 'zod';
import { fieldErrors, repositoryName, toRepositoryRef } from '../../define.js';
import type { Trigger } from '../../definitions.js';
import { sameRepository } from '../pull-request-payload.js';

export const repositorySchema = z.looseObject({
  name: z.string(),
  full_name: z.string(),
  html_url: z.string().optional(),
  owner: z.looseObject({ login: z.string() }),
});

export const userSchema = z.looseObject({ login: z.string() });

const envelopeSchema = z.looseObject({
  action: z.string().optional(),
  repository: repositorySchema,
  sender: userSchema.optional(),
});

const configSchema = z.object({ repository: repositoryName });

const COMMON_FIELDS: OutputField[] = [
  { key: 'repo.name', label: 'Repository name' },
  { key: 'repo.owner', label: 'Repository owner' },
  { key: 'repo.fullName', label: 'Repository full name' },
  { key: 'repo.url', label: 'Repository URL' },
  { key: 'sender.login', label: 'Sender login' },
  { key: 'event.action', label: 'Event action' },
];

const COMMON_SAMPLE: FieldMap = {
  'repo.name': 'your-repo',
  'repo.owner': 'your-org',
  'repo.fullName': 'your-org/your-repo',
  'repo.url': 'https://github.com/your-org/your-repo',
  'sender.login': 'octo-dev',
};

export interface EventFamily<Payload> {
  event: string;
  group: string;
  noun: string;
  actions: Record<string, string> | null;
  description?: string;
  skip?: string[];
  payload: z.ZodType<Payload>;
  fields: OutputField[];
  sample: FieldMap;
  mappingHints?: Record<string, string>;
  extract(payload: Payload): FieldMap;
  ignore?(payload: Payload): string | null;
}

export function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

export function flag(value: unknown): boolean {
  return value === true;
}

export function count(value: unknown): number | null {
  return typeof value === 'number' ? value : null;
}

export function logins(value: unknown): string {
  if (!Array.isArray(value)) return '';
  return value
    .map((entry: unknown) =>
      typeof entry === 'object' &&
      entry !== null &&
      'login' in entry &&
      typeof entry.login === 'string'
        ? entry.login
        : '',
    )
    .filter((login) => login !== '')
    .join(', ');
}

export function names(value: unknown): string {
  if (!Array.isArray(value)) return '';
  return value
    .map((entry: unknown) =>
      typeof entry === 'object' &&
      entry !== null &&
      'name' in entry &&
      typeof entry.name === 'string'
        ? entry.name
        : '',
    )
    .filter((name) => name !== '')
    .join(', ');
}

function humanize(action: string): string {
  return action.replace(/_/g, ' ');
}

function commonFields(envelope: z.infer<typeof envelopeSchema>): FieldMap {
  return {
    'repo.name': envelope.repository.name,
    'repo.owner': envelope.repository.owner.login,
    'repo.fullName': envelope.repository.full_name,
    'repo.url':
      envelope.repository.html_url ?? `https://github.com/${envelope.repository.full_name}`,
    'sender.login': envelope.sender?.login ?? '',
    'event.action': envelope.action ?? '',
  };
}

function withDefaults(fields: FieldMap, keys: OutputField[]): FieldMap {
  const complete: Record<string, FieldValue> = { ...fields };
  for (const { key } of keys) complete[key] ??= '';
  return complete;
}

export function defineEventFamily<Payload>(family: EventFamily<Payload>): Trigger[] {
  const outputFields = [...family.fields, ...COMMON_FIELDS];
  const variants: { action: string | null; description: string }[] = family.actions
    ? Object.entries(family.actions)
        .filter(([action]) => !(family.skip ?? []).includes(action))
        .map(([action, description]) => ({ action, description }))
    : [{ action: null, description: family.description ?? '' }];

  return variants.map(({ action, description }) => ({
    descriptor: {
      id: action ? `github.${family.event}.${action}` : `github.${family.event}`,
      appId: 'github',
      group: family.group,
      name: action ? `${family.noun} ${humanize(action)}` : family.noun,
      description,
      configFields: [
        { key: 'repository', label: 'Repository', kind: 'repository', required: true },
      ],
      outputFields,
      mappingHints: family.mappingHints ?? {},
      sample: withDefaults(
        { ...COMMON_SAMPLE, ...family.sample, 'event.action': action ?? '' },
        outputFields,
      ),
    },
    webhookEvent: family.event,

    parseConfig(raw) {
      const parsed = configSchema.safeParse(raw);
      if (!parsed.success) return { ok: false, errors: fieldErrors(parsed.error) };
      const repository = toRepositoryRef(parsed.data.repository);
      return repository
        ? { ok: true, repository }
        : { ok: false, errors: { repository: 'Invalid repository' } };
    },

    evaluate(payload, rawConfig) {
      const envelope = envelopeSchema.safeParse(payload);
      const parsed = family.payload.safeParse(payload);
      if (!envelope.success || !parsed.success) {
        return {
          status: 'skipped',
          reason: 'Payload does not have the shape this trigger expects',
        };
      }
      const config = configSchema.safeParse(rawConfig);
      if (!config.success) return { status: 'skipped', reason: 'Zap trigger settings are invalid' };
      if (action && envelope.data.action !== action) {
        return {
          status: 'skipped',
          reason: `${family.noun} action is "${envelope.data.action ?? 'none'}", not "${action}"`,
        };
      }
      if (!sameRepository(envelope.data, config.data.repository)) {
        return { status: 'skipped', reason: `Event is for ${envelope.data.repository.full_name}` };
      }
      const ignored = family.ignore?.(parsed.data) ?? null;
      if (ignored) return { status: 'skipped', reason: ignored };
      return {
        status: 'matched',
        fields: withDefaults(
          { ...family.extract(parsed.data), ...commonFields(envelope.data) },
          outputFields,
        ),
      };
    },
  }));
}
