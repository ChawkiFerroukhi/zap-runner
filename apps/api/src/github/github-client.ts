import { Octokit } from '@octokit/rest';
import type { SecretBox } from '../platform/secret-box.js';
import type { UsersRepository } from '../users/users.repository.js';

export type GitHubClientFactory = (userId: string) => Promise<Octokit>;

export type OctokitRequestOptions = ConstructorParameters<typeof Octokit>[0];

export function createGitHubClientFactory(
  users: UsersRepository,
  secretBox: SecretBox,
  options: OctokitRequestOptions = {},
): GitHubClientFactory {
  return async (userId) => {
    const sealed = await users.findSealedToken(userId);
    if (!sealed) throw new Error(`No GitHub token stored for user ${userId}`);
    return new Octokit({ ...options, auth: secretBox.open(sealed) });
  };
}
