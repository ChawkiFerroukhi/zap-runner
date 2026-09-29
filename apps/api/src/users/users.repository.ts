import type { SessionUser } from '@zap-runner/shared';
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
  };
}
