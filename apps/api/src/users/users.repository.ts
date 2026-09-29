import { copilotProviderIds, type CopilotProviderId, type SessionUser } from '@zap-runner/shared';
import { isValidObjectId } from 'mongoose';
import type { GitHubProfile } from '../github/github-identity.js';
import { UserModel } from './user.model.js';

export interface UsersRepository {
  upsertFromGitHub(
    profile: GitHubProfile,
    sealedToken: string,
    scopes: string[],
  ): Promise<SessionUser>;
  findSessionUser(userId: string): Promise<SessionUser | null>;
  findSealedToken(userId: string): Promise<string | null>;
  findCopilotKey(userId: string): Promise<StoredCopilotKey | null>;
  setCopilotKey(userId: string, key: StoredCopilotKey | null): Promise<void>;
}

export interface StoredCopilotKey {
  provider: CopilotProviderId;
  sealed: string;
  hint: string;
}

function isProvider(value: unknown): value is CopilotProviderId {
  return copilotProviderIds.some((id) => id === value);
}

interface StoredUser {
  _id: { toString(): string };
  login: string;
  name?: string | null | undefined;
  avatarUrl: string;
}

function toSessionUser(user: StoredUser): SessionUser {
  return {
    id: user._id.toString(),
    login: user.login,
    name: user.name ?? null,
    avatarUrl: user.avatarUrl,
  };
}

export function createUsersRepository(): UsersRepository {
  return {
    async upsertFromGitHub(profile, sealedToken, scopes) {
      const user = await UserModel.findOneAndUpdate(
        { githubId: profile.id },
        {
          login: profile.login,
          name: profile.name,
          avatarUrl: profile.avatarUrl,
          accessToken: sealedToken,
          scopes,
        },
        { upsert: true, returnDocument: 'after', lean: true },
      );
      if (!user) throw new Error('User upsert returned no document');
      return toSessionUser(user);
    },

    async findSessionUser(userId) {
      if (!isValidObjectId(userId)) return null;
      const user = await UserModel.findById(userId).lean();
      return user ? toSessionUser(user) : null;
    },

    async findSealedToken(userId) {
      if (!isValidObjectId(userId)) return null;
      const user = await UserModel.findById(userId, { accessToken: 1 }).lean();
      return user?.accessToken ?? null;
    },

    async findCopilotKey(userId) {
      if (!isValidObjectId(userId)) return null;
      const user = await UserModel.findById(userId, {
        copilotKey: 1,
        copilotKeyHint: 1,
        copilotProvider: 1,
      }).lean();
      if (!user?.copilotKey || !isProvider(user.copilotProvider)) return null;
      return {
        provider: user.copilotProvider,
        sealed: user.copilotKey,
        hint: user.copilotKeyHint ?? '',
      };
    },

    async setCopilotKey(userId, key) {
      await UserModel.updateOne(
        { _id: userId },
        {
          copilotProvider: key?.provider ?? null,
          copilotKey: key?.sealed ?? null,
          copilotKeyHint: key?.hint ?? null,
        },
      );
    },
  };
}
