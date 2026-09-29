import { createHash, randomBytes } from 'node:crypto';
import { SessionModel } from './session.model.js';

export interface IssuedSession {
  token: string;
  expiresAt: Date;
}

export interface SessionStore {
  issue(userId: string): Promise<IssuedSession>;
  resolve(token: string): Promise<string | null>;
  revoke(token: string): Promise<void>;
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function createSessionStore(ttlHours: number): SessionStore {
  return {
    async issue(userId) {
      const token = randomBytes(32).toString('base64url');
      const expiresAt = new Date(Date.now() + ttlHours * 3_600_000);
      await SessionModel.create({ tokenHash: hashToken(token), userId, expiresAt });
      return { token, expiresAt };
    },

    async resolve(token) {
      const session = await SessionModel.findOne({
        tokenHash: hashToken(token),
        expiresAt: { $gt: new Date() },
      }).lean();
      return session ? session.userId.toString() : null;
    },

    async revoke(token) {
      await SessionModel.deleteOne({ tokenHash: hashToken(token) });
    },
  };
}
