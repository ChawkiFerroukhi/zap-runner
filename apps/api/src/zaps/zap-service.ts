import { randomBytes } from 'node:crypto';
import { RequestError } from '@octokit/request-error';
import type { ZapDto, ZapInput } from '@zap-runner/shared';
import type { GitHubClientFactory } from '../github/github-client.js';
import { githubRequestError, HttpError, notFoundError } from '../http/errors.js';
import type { RepositoryRef } from '../integrations/definitions.js';
import { toRepositoryRef } from '../integrations/define.js';
import type { Registry } from '../integrations/registry.js';
import type { SecretBox } from '../platform/secret-box.js';
import type { StoredWebhook } from './zap-mapping.js';
import { userZaps } from './user-zaps.js';
import { assertValidZap } from './zap-validation.js';

export interface ZapService {
  list(userId: string): Promise<ZapDto[]>;
  get(userId: string, zapId: string): Promise<ZapDto>;
  create(userId: string, input: ZapInput): Promise<ZapDto>;
  update(userId: string, zapId: string, input: ZapInput): Promise<ZapDto>;
  enable(userId: string, zapId: string): Promise<ZapDto>;
  disable(userId: string, zapId: string): Promise<ZapDto>;
  remove(userId: string, zapId: string): Promise<void>;
  duplicate(userId: string, zapId: string): Promise<ZapDto>;
}

export interface ZapServiceDependencies {
  registry: Registry;
  githubFor: GitHubClientFactory;
  secretBox: SecretBox;
  webhookUrl: (zapId: string) => string;
}

const NAME_MAX_LENGTH = 120;
const COPY_SUFFIX = ' (copy)';

export function copyName(name: string): string {
  return `${name.slice(0, NAME_MAX_LENGTH - COPY_SUFFIX.length).trimEnd()}${COPY_SUFFIX}`;
}

interface Subscription {
  repository: RepositoryRef;
  event: string;
}

function githubError(error: unknown, action: string): HttpError {
  if (!(error instanceof RequestError))
    return new HttpError(502, 'github_unreachable', `Could not ${action}: GitHub did not respond`);
  if (error.status === 404 || error.status === 403)
    return new HttpError(
      422,
      'github_error',
      `Could not ${action}: the repository was not found or your account is not an admin of it`,
    );
  if (error.status === 422)
    return new HttpError(
      422,
      'github_error',
      `Could not ${action}: GitHub rejected the webhook for this repository`,
    );
  return githubRequestError(error);
}

export function createZapService(deps: ZapServiceDependencies): ZapService {
  function subscriptionOf(zap: Pick<ZapDto, 'trigger'>): Subscription {
    const trigger = deps.registry.trigger(zap.trigger.type);
    const parsed = trigger?.parseConfig(zap.trigger.config);
    if (!trigger || !parsed?.ok) {
      throw new HttpError(400, 'invalid_zap', 'The Zap trigger is not configured');
    }
    return { repository: parsed.repository, event: trigger.webhookEvent };
  }

  async function subscribe(
    userId: string,
    zapId: string,
    subscription: Subscription,
  ): Promise<StoredWebhook> {
    const github = await deps.githubFor(userId);
    const secret = randomBytes(32).toString('hex');
    try {
      const { data } = await github.rest.repos.createWebhook({
        owner: subscription.repository.owner,
        repo: subscription.repository.name,
        events: [subscription.event],
        active: true,
        config: {
          url: deps.webhookUrl(zapId),
          content_type: 'json',
          insecure_ssl: '0',
          secret,
        },
      });
      return {
        hookId: data.id,
        secret: deps.secretBox.seal(secret),
        repository: subscription.repository.fullName,
        verifiedAt: null,
      };
    } catch (error) {
      throw githubError(error, 'create the GitHub webhook');
    }
  }

  async function unsubscribe(userId: string, webhook: ZapDto['webhook']): Promise<void> {
    if (!webhook) return;
    const repository = toRepositoryRef(webhook.repository);
    if (!repository) return;
    const github = await deps.githubFor(userId);
    try {
      await github.rest.repos.deleteWebhook({
        owner: repository.owner,
        repo: repository.name,
        hook_id: webhook.hookId,
      });
    } catch (error) {
      if (error instanceof RequestError && error.status === 404) return;
      throw githubError(error, 'remove the GitHub webhook');
    }
  }

  async function owned(userId: string, zapId: string): Promise<ZapDto> {
    const zap = await userZaps(userId).get(zapId);
    if (!zap) throw notFoundError('Zap');
    return zap;
  }

  function sameSubscription(a: Subscription, b: Subscription): boolean {
    return (
      a.event === b.event &&
      a.repository.fullName.toLowerCase() === b.repository.fullName.toLowerCase()
    );
  }

  async function create(userId: string, input: ZapInput): Promise<ZapDto> {
    if (!input.draft) assertValidZap(input, deps.registry);
    return userZaps(userId).create(input);
  }

  return {
    list: (userId) => userZaps(userId).list(),

    get: owned,

    create,

    async update(userId, zapId, input) {
      const current = await owned(userId, zapId);
      if (input.draft && current.enabled) {
        throw new HttpError(409, 'zap_enabled', 'Turn the Zap off before saving it as a draft');
      }
      if (!input.draft) assertValidZap(input, deps.registry);
      const zaps = userZaps(userId);

      const next = current.enabled ? subscriptionOf(input) : null;
      if (current.enabled && next && !sameSubscription(subscriptionOf(current), next)) {
        const webhook = await subscribe(userId, zapId, next);
        await zaps.setSubscription(zapId, webhook);
        await unsubscribe(userId, current.webhook);
      }

      const updated = await zaps.update(zapId, input);
      if (!updated) throw notFoundError('Zap');
      return updated;
    },

    async enable(userId, zapId) {
      const zap = await owned(userId, zapId);
      if (zap.enabled) return zap;
      if (zap.draft) {
        throw new HttpError(
          409,
          'zap_is_draft',
          'Finish the draft and save it before turning it on',
        );
      }
      const webhook = await subscribe(userId, zapId, subscriptionOf(zap));
      const enabled = await userZaps(userId).setSubscription(zapId, webhook);
      if (!enabled) throw notFoundError('Zap');
      return enabled;
    },

    async disable(userId, zapId) {
      const zap = await owned(userId, zapId);
      await unsubscribe(userId, zap.webhook);
      const disabled = await userZaps(userId).setSubscription(zapId, null);
      if (!disabled) throw notFoundError('Zap');
      return disabled;
    },

    async remove(userId, zapId) {
      const zap = await owned(userId, zapId);
      await unsubscribe(userId, zap.webhook);
      await userZaps(userId).remove(zapId);
    },

    async duplicate(userId, zapId) {
      const source = await owned(userId, zapId);
      return create(userId, {
        name: copyName(source.name),
        draft: source.draft,
        trigger: { type: source.trigger.type, config: source.trigger.config },
        action: { type: source.action.type, config: source.action.config },
      });
    },
  };
}
