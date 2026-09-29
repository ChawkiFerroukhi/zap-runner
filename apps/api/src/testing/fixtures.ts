import type { ZapInput } from '@zap-runner/shared';
import { createSessionStore } from '../auth/session-store.js';
import type { SecretBox } from '../platform/secret-box.js';
import { createUsersRepository } from '../users/users.repository.js';

let githubIds = 1;

export interface SignedInUser {
  userId: string;
  cookie: string;
}

export async function signIn(login: string, secretBox: SecretBox): Promise<SignedInUser> {
  const user = await createUsersRepository().upsertFromGitHub(
    { id: githubIds++, login, name: null, avatarUrl: `https://avatars.test/${login}` },
    secretBox.seal(`gho_${login}`),
    ['repo'],
  );
  const session = await createSessionStore(1).issue(user.id);
  return { userId: user.id, cookie: `zr_session=${session.token}` };
}

export function commentZap(overrides: Partial<ZapInput> = {}): ZapInput {
  return {
    name: 'Thank PR authors',
    draft: false,
    trigger: {
      type: 'github.pull_request.opened',
      config: { repository: 'chawki/playground', ignoreDrafts: false },
    },
    action: {
      type: 'github.comment',
      config: {
        body: 'Thanks @{{pr.author}} for "{{pr.title}}"',
        repository: '{{repo.fullName}}',
        number: '{{pr.number}}',
      },
    },
    ...overrides,
  };
}

export interface PullRequestPayloadOptions {
  action?: string;
  repository?: string;
  draft?: boolean;
  number?: number;
  merged?: boolean;
  baseBranch?: string;
}

export function pullRequestPayload(options: PullRequestPayloadOptions = {}) {
  const fullName = options.repository ?? 'chawki/playground';
  const [owner = '', name = ''] = fullName.split('/');
  const number = options.number ?? 42;
  return {
    action: options.action ?? 'opened',
    number,
    pull_request: {
      number,
      title: 'Add rate limiting',
      body: null,
      html_url: `https://github.com/${fullName}/pull/${number}`,
      draft: options.draft ?? false,
      merged: options.merged ?? false,
      merged_by: options.merged ? { login: 'maintainer' } : null,
      user: { login: 'octocat' },
      base: { ref: options.baseBranch ?? 'main' },
      head: { ref: 'feature/rate-limit' },
    },
    repository: { name, full_name: fullName, owner: { login: owner } },
    sender: { login: 'octocat', type: 'User' },
  };
}

export interface CommentPayloadOptions {
  body?: string;
  onPullRequest?: boolean;
  repository?: string;
}

export function commentPayload(options: CommentPayloadOptions = {}) {
  const fullName = options.repository ?? 'chawki/playground';
  const [owner = '', name = ''] = fullName.split('/');
  return {
    action: 'created',
    issue: {
      number: 42,
      title: 'Add rate limiting',
      html_url: `https://github.com/${fullName}/pull/42`,
      user: { login: 'octocat' },
      ...(options.onPullRequest === false
        ? {}
        : { pull_request: { url: 'https://api.github.com/pulls/42' } }),
    },
    comment: {
      body: options.body ?? 'Could you add a test?',
      html_url: `https://github.com/${fullName}/pull/42#issuecomment-1`,
      user: { login: 'reviewer' },
    },
    repository: { name, full_name: fullName, owner: { login: owner } },
    sender: { login: 'reviewer' },
  };
}
