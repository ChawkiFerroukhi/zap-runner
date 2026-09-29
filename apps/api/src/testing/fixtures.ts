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
      user: { login: 'octocat' },
      base: { ref: 'main' },
      head: { ref: 'feature/rate-limit' },
    },
    repository: { name, full_name: fullName, owner: { login: owner } },
    sender: { login: 'octocat', type: 'User' },
  };
}
