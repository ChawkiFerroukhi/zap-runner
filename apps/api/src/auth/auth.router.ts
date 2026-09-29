import { randomBytes, timingSafeEqual } from 'node:crypto';
import { Router, type CookieOptions, type Response } from 'express';
import { z } from 'zod';
import type { GitHubIdentity } from '../github/github-identity.js';
import { readCookie } from '../http/cookies.js';
import type { SecretBox } from '../platform/secret-box.js';
import type { UsersRepository } from '../users/users.repository.js';
import { currentAuth, requireAuth, SESSION_COOKIE } from './authenticate.js';
import type { SessionStore } from './session-store.js';

const STATE_COOKIE = 'zr_oauth_state';
const STATE_PATH = '/api/auth/github';
const STATE_TTL_MS = 10 * 60_000;

const callbackQuerySchema = z.object({ code: z.string().min(1), state: z.string().min(1) });

export interface AuthRouterDependencies {
  identity: GitHubIdentity;
  users: UsersRepository;
  sessions: SessionStore;
  secretBox: SecretBox;
  appUrl: string;
}

function constantTimeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function authRouter(deps: AuthRouterDependencies): Router {
  const router = Router();
  const secure = deps.appUrl.startsWith('https:');
  const baseCookie: CookieOptions = { httpOnly: true, sameSite: 'lax', secure };

  function failSignIn(res: Response, reason: string): void {
    res.redirect(`${deps.appUrl}/sign-in?error=${encodeURIComponent(reason)}`);
  }

  router.get('/github/login', (_req, res) => {
    const state = randomBytes(24).toString('base64url');
    res.cookie(STATE_COOKIE, state, { ...baseCookie, path: STATE_PATH, maxAge: STATE_TTL_MS });
    res.redirect(deps.identity.authorizeUrl(state));
  });

  router.get('/github/callback', async (req, res) => {
    const expectedState = readCookie(req, STATE_COOKIE);
    res.clearCookie(STATE_COOKIE, { ...baseCookie, path: STATE_PATH });

    if (typeof req.query['error'] === 'string') {
      failSignIn(res, req.query['error']);
      return;
    }
    const query = callbackQuerySchema.safeParse(req.query);
    if (!query.success || !expectedState || !constantTimeEqual(query.data.state, expectedState)) {
      failSignIn(res, 'state_mismatch');
      return;
    }

    try {
      const grant = await deps.identity.exchangeCode(query.data.code);
      const profile = await deps.identity.fetchProfile(grant.accessToken);
      const user = await deps.users.upsertFromGitHub(
        profile,
        deps.secretBox.seal(grant.accessToken),
        grant.scopes,
      );
      const session = await deps.sessions.issue(user.id);
      res.cookie(SESSION_COOKIE, session.token, {
        ...baseCookie,
        path: '/',
        expires: session.expiresAt,
      });
      req.log.info({ userId: user.id, scopes: grant.scopes }, 'signed in');
      res.redirect(`${deps.appUrl}/zaps`);
    } catch (error) {
      req.log.warn({ err: error }, 'github sign-in failed');
      failSignIn(res, 'github_error');
    }
  });

  router.get('/me', requireAuth, (req, res) => {
    res.json(currentAuth(req).user);
  });

  router.post('/logout', async (req, res) => {
    if (req.auth) await deps.sessions.revoke(req.auth.token);
    res.clearCookie(SESSION_COOKIE, { ...baseCookie, path: '/' });
    res.status(204).end();
  });

  return router;
}
