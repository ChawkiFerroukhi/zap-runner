import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { buildTestApp, setCookies, TEST_APP_URL } from '../testing/test-app.js';

describe('github sign-in', () => {
  it('redirects to GitHub with a state that is also pinned in an httpOnly cookie', async () => {
    const response = await request(buildTestApp()).get('/api/auth/github/login').expect(302);
    const state = new URL(response.headers['location'] ?? '').searchParams.get('state');
    const cookies = setCookies(response);
    expect(state).toBeTruthy();
    expect(cookies.some((c) => c.startsWith(`zr_oauth_state=${state ?? ''};`))).toBe(true);
    expect(cookies.some((c) => c.includes('HttpOnly'))).toBe(true);
  });

  it('rejects a callback whose state does not match, without talking to GitHub', async () => {
    const response = await request(buildTestApp())
      .get('/api/auth/github/callback?code=abc&state=forged')
      .set('cookie', 'zr_oauth_state=expected')
      .expect(302);
    expect(response.headers['location']).toBe(`${TEST_APP_URL}/sign-in?error=state_mismatch`);
  });

  it('requires a session for the current user endpoint', async () => {
    await request(buildTestApp()).get('/api/auth/me').expect(401);
  });

  it('refuses state-changing requests from another origin', async () => {
    await request(buildTestApp())
      .post('/api/auth/logout')
      .set('origin', 'https://evil.test')
      .expect(403);
    await request(buildTestApp()).post('/api/auth/logout').set('origin', TEST_APP_URL).expect(204);
  });
});
