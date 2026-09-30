import type {
  ConfigValues,
  CopilotDraftInput,
  CopilotEvent,
  CopilotProviderId,
  CopilotStatus,
  ZapInput,
} from '@zap-runner/shared';
import type { GitHubClientFactory } from '../github/github-client.js';
import { HttpError } from '../http/errors.js';
import type { Registry } from '../integrations/registry.js';
import type { SecretBox } from '../platform/secret-box.js';
import type { UsersRepository } from '../users/users.repository.js';
import type { ZapService } from '../zaps/zap-service.js';
import { assertValidZap } from '../zaps/zap-validation.js';
import {
  CopilotKeyRejected,
  CopilotUnavailable,
  type CopilotAnswer,
  type CopilotDraft,
} from './copilot-model.js';
import type { CopilotModels } from './copilot-providers.js';
import type { PendingDrafts } from './pending-drafts.js';

const MAX_ATTEMPTS = 2;

export type CopilotEmit = (event: CopilotEvent) => void;

export interface CopilotService {
  status(userId: string): Promise<CopilotStatus>;
  saveKey(userId: string, provider: CopilotProviderId, apiKey: string): Promise<CopilotStatus>;
  removeKey(userId: string): Promise<CopilotStatus>;
  draft(
    userId: string,
    input: CopilotDraftInput,
    emit: CopilotEmit,
    signal?: AbortSignal,
  ): Promise<void>;
}

export interface CopilotServiceDependencies {
  models: CopilotModels;
  users: UsersRepository;
  secretBox: SecretBox;
  registry: Registry;
  zaps: ZapService;
  githubFor: GitHubClientFactory;
  serverKey: { provider: CopilotProviderId; apiKey: string } | undefined;
  pending: PendingDrafts;
}

interface ResolvedKey {
  apiKey: string;
  provider: CopilotProviderId;
  source: 'account' | 'server';
  hint: string;
}

interface Correction {
  previous: CopilotDraft;
  problems: string[];
}

function toConfig(entries: CopilotDraft['triggerConfig']): ConfigValues {
  return Object.fromEntries(entries.map((entry) => [entry.key, entry.value]));
}

function toInput(draft: CopilotDraft): ZapInput {
  return {
    name: draft.name.trim() || 'Drafted Zap',
    draft: true,
    trigger: { type: draft.triggerId, config: toConfig(draft.triggerConfig) },
    action: { type: draft.actionId, config: toConfig(draft.actionConfig) },
  };
}

function hintOf(apiKey: string): string {
  return `…${apiKey.slice(-4)}`;
}

function problemsWith(draft: CopilotDraft, registry: Registry, repositories: string[]): string[] {
  const input = toInput(draft);
  const problems: string[] = [];
  const repository = input.trigger.config['repository'];
  if (
    typeof repository === 'string' &&
    !repositories.some((name) => name.toLowerCase() === repository.toLowerCase())
  ) {
    problems.push(`trigger.config.repository: ${repository} is not one of the user's repositories`);
  }
  try {
    assertValidZap(input, registry);
  } catch (error) {
    if (!(error instanceof HttpError)) throw error;
    for (const [path, message] of Object.entries(error.fields ?? {}))
      problems.push(`${path}: ${message}`);
  }
  return problems;
}

function withRepository(draft: CopilotDraft, repository: string): CopilotDraft {
  const others = draft.triggerConfig.filter((entry) => entry.key !== 'repository');
  return { ...draft, triggerConfig: [{ key: 'repository', value: repository }, ...others] };
}

function describeZap(draft: CopilotDraft, registry: Registry, repository: string): string {
  const trigger = registry.trigger(draft.triggerId)?.descriptor.name ?? draft.triggerId;
  const action = registry.action(draft.actionId)?.descriptor.name ?? draft.actionId;
  return `${trigger} on ${repository}, then ${action.charAt(0).toLowerCase()}${action.slice(1)}.`;
}

function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return `${String(count)} ${count === 1 ? singular : pluralForm}`;
}

export class CopilotCancelled extends Error {}

function throwIfCancelled(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw new CopilotCancelled('The draft was cancelled');
}

function asHttpError(error: unknown): unknown {
  if (error instanceof CopilotKeyRejected)
    return new HttpError(400, 'copilot_key_rejected', error.message);
  if (error instanceof CopilotUnavailable)
    return new HttpError(502, 'copilot_unavailable', error.message);
  return error;
}

export function createCopilotService(deps: CopilotServiceDependencies): CopilotService {
  const providers = Object.values(deps.models).map((model) => model.provider);

  async function keyFor(userId: string): Promise<ResolvedKey | null> {
    const stored = await deps.users.findCopilotKey(userId);
    if (stored) {
      return {
        apiKey: deps.secretBox.open(stored.sealed),
        provider: stored.provider,
        source: 'account',
        hint: stored.hint,
      };
    }
    if (deps.serverKey)
      return { ...deps.serverKey, source: 'server', hint: hintOf(deps.serverKey.apiKey) };
    return null;
  }

  async function status(userId: string): Promise<CopilotStatus> {
    const key = await keyFor(userId);
    if (!key) return { configured: false, source: null, keyHint: null, provider: null, providers };
    return {
      configured: true,
      source: key.source,
      keyHint: key.hint,
      provider: deps.models[key.provider].provider,
      providers,
    };
  }

  async function adminRepositories(userId: string): Promise<string[]> {
    const github = await deps.githubFor(userId);
    const repositories = await github.paginate(github.rest.repos.listForAuthenticatedUser, {
      per_page: 100,
      sort: 'pushed',
      affiliation: 'owner,collaborator,organization_member',
    });
    return repositories
      .filter((repository) => repository.permissions?.admin === true)
      .map((r) => r.full_name);
  }

  return {
    status,

    async saveKey(userId, provider, apiKey) {
      try {
        await deps.models[provider].verifyKey(apiKey);
      } catch (error) {
        if (error instanceof CopilotKeyRejected) {
          throw new HttpError(400, 'copilot_key_rejected', 'The provider rejected this API key', {
            apiKey: 'The provider rejected this key',
          });
        }
        throw asHttpError(error);
      }
      await deps.users.setCopilotKey(userId, {
        provider,
        sealed: deps.secretBox.seal(apiKey),
        hint: hintOf(apiKey),
      });
      return status(userId);
    },

    async removeKey(userId) {
      await deps.users.setCopilotKey(userId, null);
      return status(userId);
    },

    async draft(userId, input, emit, signal) {
      const key = await keyFor(userId);
      if (!key) {
        throw new HttpError(
          409,
          'copilot_not_configured',
          'Add a Copilot API key in Settings to draft Zaps',
        );
      }
      const model = deps.models[key.provider];
      const registry = deps.registry.describe();

      emit({
        type: 'step',
        step: 'repositories',
        state: 'active',
        label: 'Reading your repositories',
      });
      const repositories = await adminRepositories(userId);
      throwIfCancelled(signal);
      emit({
        type: 'step',
        step: 'repositories',
        state: 'done',
        label: `Found ${plural(repositories.length, 'repository', 'repositories')} you administer`,
      });

      const pending = input.answer ? deps.pending.take(userId, input.answer.pendingId) : null;
      if (input.answer && !pending) {
        throw new HttpError(
          410,
          'copilot_question_expired',
          'That question expired. Draft the Zap again.',
        );
      }

      async function finish(draft: CopilotDraft, modelName: string): Promise<boolean> {
        emit({ type: 'step', step: 'check', state: 'active', label: 'Checking the draft' });
        const problems = problemsWith(draft, deps.registry, repositories);
        if (problems.length > 0) return false;
        emit({ type: 'step', step: 'check', state: 'done', label: 'Draft is valid' });
        throwIfCancelled(signal);
        emit({ type: 'step', step: 'save', state: 'active', label: 'Saving the Zap' });
        const zap = await deps.zaps.create(userId, toInput(draft));
        emit({
          type: 'step',
          step: 'save',
          state: 'done',
          label: 'Saved as a draft for your review',
        });
        emit({ type: 'drafted', zap, explanation: draft.explanation, model: modelName });
        return true;
      }

      if (pending?.awaiting === 'repository' && input.answer) {
        const repository = input.answer.value;
        if (!pending.options.includes(repository)) {
          throw new HttpError(
            400,
            'copilot_invalid_answer',
            'Choose one of the listed repositories',
          );
        }
        emit({
          type: 'step',
          step: 'model',
          state: 'skipped',
          label: 'Reusing the draft, no new request needed',
        });
        const completed = withRepository(pending.draft, repository);
        const explanation = describeZap(completed, deps.registry, repository);
        const done = await finish({ ...completed, status: 'ready', explanation }, pending.model);
        if (!done)
          throw new HttpError(422, 'copilot_invalid_draft', 'The drafted Zap is not valid');
        return;
      }

      const clarification = pending?.awaiting === 'clarification' ? input.answer?.value : undefined;
      let correction: Correction | undefined;
      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        emit({
          type: 'step',
          step: 'model',
          state: 'active',
          label: correction
            ? `Asking ${model.provider.name} to fix the draft`
            : `Drafting with ${model.provider.name}`,
        });
        let answer: CopilotAnswer;
        try {
          answer = await model.draft(
            key.apiKey,
            {
              prompt: input.prompt,
              registry,
              repositories,
              ...(clarification ? { clarification } : {}),
              ...(correction ? { correction } : {}),
            },
            {
              fallback: (from, to, reason) => {
                emit({
                  type: 'note',
                  step: 'model',
                  message: `${from} is ${reason}, trying ${to}`,
                });
              },
            },
          );
        } catch (error) {
          throw asHttpError(error);
        }
        throwIfCancelled(signal);
        const { draft } = answer;
        emit({ type: 'step', step: 'model', state: 'done', label: `Drafted by ${answer.model}` });

        if (draft.status === 'unsupported') {
          emit({ type: 'unsupported', message: draft.explanation });
          return;
        }
        if (draft.status === 'needs_repository') {
          const pendingId = deps.pending.hold({
            userId,
            prompt: input.prompt,
            draft,
            model: answer.model,
            awaiting: 'repository',
            options: repositories,
          });
          emit({
            type: 'question',
            question: {
              pendingId,
              kind: 'repository',
              text: draft.question || 'Which repository should this Zap watch?',
              options: repositories,
            },
          });
          return;
        }
        if (draft.status === 'needs_clarification') {
          const pendingId = deps.pending.hold({
            userId,
            prompt: input.prompt,
            draft,
            model: answer.model,
            awaiting: 'clarification',
            options: [],
          });
          emit({ type: 'question', question: { pendingId, kind: 'text', text: draft.question } });
          return;
        }

        if (await finish(draft, answer.model)) return;
        const problems = problemsWith(draft, deps.registry, repositories);
        emit({
          type: 'note',
          step: 'check',
          message: `Found ${plural(problems.length, 'problem')}, asking for a fix`,
        });
        correction = { previous: draft, problems };
      }
      throw new HttpError(
        422,
        'copilot_invalid_draft',
        `The Copilot could not produce a valid Zap: ${correction?.problems.join('; ') ?? 'unknown problem'}`,
      );
    },
  };
}
