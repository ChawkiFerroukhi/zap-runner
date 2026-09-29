import type { SessionUser } from '@zap-runner/shared';
import type { Request, RequestHandler } from 'express';
import { readCookie } from '../http/cookies.js';
import { HttpError } from '../http/errors.js';
import type { UsersRepository } from '../users/users.repository.js';
import type { SessionStore } from './session-store.js';

export const SESSION_COOKIE = 'zr_session';

export interface AuthContext {
  user: SessionUser;
  token: string;
}

declare module 'express-serve-static-core' {
  interface Request {
    auth?: AuthContext;
  }
}

export function authenticate(sessions: SessionStore, users: UsersRepository): RequestHandler {
  return async (req, _res, next) => {
    const token = readCookie(req, SESSION_COOKIE);
    if (token) {
      const userId = await sessions.resolve(token);
      const user = userId ? await users.findSessionUser(userId) : null;
      if (user) req.auth = { user, token };
    }
    next();
  };
}

export function currentAuth(req: Request): AuthContext {
  if (!req.auth) throw new HttpError(401, 'unauthenticated', 'Sign in required');
  return req.auth;
}

export const requireAuth: RequestHandler = (req, _res, next) => {
  currentAuth(req);
  next();
};
