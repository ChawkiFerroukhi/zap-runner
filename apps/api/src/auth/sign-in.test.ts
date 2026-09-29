import { randomBytes } from 'node:crypto';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import type { GitHubIdentity } from '../github/github-identity.js';
import { createSecretBox } from '../platform/secret-box.js';
import { useTestDatabase } from '../testing/database.js';
import { buildTestApp, setCookies, TEST_APP_URL } from '../testing/test-app.js';
import { UserModel } from '../users/user.model.js';
import { createUsersRepository } from '../users/users.repository.js';
import { SessionModel } from './session.model.js';
import { createSessionStore } from './session-store.js';

useTestDatabase();

const GITHUB_TOKEN = 'gho_test_token_value';

const identity: GitHubIdentity = {
  authorizeUrl: (state) => `https://github.com/login/oauth/authorize?state=${state}`,
  exchangeCode: (code) =>
    code === 'valid-code'
      ? Promise.resolve({ accessToken: GITHUB_TOKEN, scopes: ['repo'] })
      : Promise.reject(new Error('bad code')),
  fetchProfile: () =>
    Promise.resolve({
      id: 4242,
      login: 'octocat',
      name: 'The Octocat',
      avatarUrl: 'https://avatars.githubusercontent.com/u/4242',
    }),
};

function signInApp() {
  const secretBox = createSecretBox(randomBytes(32));
  const app = buildTestApp({
    identity,
    secretBox,
    users: createUsersRepository(),
    sessions: createSessionStore(1),
  });
  return { app, secretBox };
}

async function completeSignIn(app: ReturnType<typeof signInApp>['app']): Promise<string> {
  const agent = request(app);
  const login = await agent.get('/api/auth/github/login');
  const state = new URL(login.headers['location'] ?? '').searchParams.get('state') ?? '';
  const callback = await agent
    .get(`/api/auth/github/callback?code=valid-code&state=${state}`)
    .set('cookie', `zr_oauth_state=${state}`)
    .expect(302);
  expect(callback.headers['location']).toBe(`${TEST_APP_URL}/zaps`);
  const session = setCookies(callback).find((cookie) => cookie.startsWith('zr_session='));
  return session?.split(';')[0] ?? '';
}

describe('completed github sign-in', () => {
  it('creates a session that identifies the user', async () => {
    const { app } = signInApp();
    const cookie = await completeSignIn(app);

    const me = await request(app).get('/api/auth/me').set('cookie', cookie).expect(200);
    expect(me.body).toMatchObject({ login: 'octocat', name: 'The Octocat' });
  });

  it('stores the GitHub token encrypted and the session token only as a hash', async () => {
    const { app, secretBox } = signInApp();
    const cookie = await completeSignIn(app);
    const rawSessionToken = cookie.replace('zr_session=', '');

    const user = await UserModel.findOne({ githubId: 4242 }).lean();
    expect(user?.accessToken).not.toContain(GITHUB_TOKEN);
    expect(secretBox.open(user?.accessToken ?? '')).toBe(GITHUB_TOKEN);

    const session = await SessionModel.findOne().lean();
    expect(session?.tokenHash).toHaveLength(64);
    expect(session?.tokenHash).not.toBe(rawSessionToken);
  });

  it('updates the existing user on a second sign-in instead of duplicating it', async () => {
    const { app } = signInApp();
    await completeSignIn(app);
    await completeSignIn(app);
    expect(await UserModel.countDocuments()).toBe(1);
  });

  it('revokes the session on sign out', async () => {
    const { app } = signInApp();
    const cookie = await completeSignIn(app);

    await request(app)
      .post('/api/auth/logout')
      .set('origin', TEST_APP_URL)
      .set('cookie', cookie)
      .expect(204);
    await request(app).get('/api/auth/me').set('cookie', cookie).expect(401);
  });
});
