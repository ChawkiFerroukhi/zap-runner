import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { useTestDatabase } from '../testing/database.js';
import { signIn, type SignedInUser } from '../testing/fixtures.js';
import { errorFrom } from '../testing/responses.js';
import { createTestContext, TEST_APP_URL, type TestContext } from '../testing/test-app.js';
import { DEFAULT_RATE_LIMITS, type RateLimits } from './rate-limit.js';

useTestDatabase();

function limits(overrides: Partial<RateLimits>): RateLimits {
  return { ...DEFAULT_RATE_LIMITS, ...overrides };
}

const TWO_PER_MINUTE = { limit: 2, windowMs: 60_000 };

describe('rate limiting', () => {
  let context: TestContext;
  let alice: SignedInUser;
  let bob: SignedInUser;

  async function setUp(overrides: Partial<RateLimits>): Promise<void> {
    context = createTestContext({ rateLimits: limits(overrides) });
    alice = await signIn('alice', context.secretBox);
    bob = await signIn('bob', context.secretBox);
  }

  function write(user: SignedInUser | null) {
    const pending = request(context.app).post('/api/zaps').set('origin', TEST_APP_URL);
    return (user ? pending.set('cookie', user.cookie) : pending).send({});
  }

  describe('writes under /api', () => {
    beforeEach(async () => {
      await setUp({ writes: TWO_PER_MINUTE });
    });

    it('answers 429 rate_limited with Retry-After once a user spends their budget', async () => {
      await write(alice).expect(400);
      await write(alice).expect(400);

      const limited = await write(alice).expect(429);
      const error = errorFrom(limited);
      expect(error.code).toBe('rate_limited');
      expect(error.message).toMatch(/^Too many requests\. Try again in \d+ seconds?\.$/);
      expect(Number(limited.headers['retry-after'])).toBeGreaterThan(0);
      expect(limited.headers['ratelimit']).toBeDefined();
    });

    it('gives each signed-in user their own budget', async () => {
      await write(alice).expect(400);
      await write(alice).expect(400);
      await write(alice).expect(429);

      await write(bob).expect(400);
    });

    it('keys signed-out requests by IP', async () => {
      await write(null).expect(401);
      await write(null).expect(401);
      await write(null).expect(429);

      await write(alice).expect(400);
    });

    it('does not limit reads', async () => {
      for (let attempt = 0; attempt < 5; attempt++) {
        await request(context.app).get('/api/zaps').set('cookie', alice.cookie).expect(200);
      }
    });
  });

  it('limits Copilot drafts separately from other writes', async () => {
    await setUp({ copilotDrafts: { limit: 1, windowMs: 60_000 } });
    const draft = () =>
      request(context.app)
        .post('/api/copilot/drafts')
        .set('origin', TEST_APP_URL)
        .set('cookie', alice.cookie)
        .send({ prompt: 'Comment on every new pull request' });

    await draft().expect(409);
    const limited = await draft().expect(429);
    expect(errorFrom(limited).code).toBe('rate_limited');
    await write(alice).expect(400);
  });

  it('limits webhook deliveries by IP with the ApiError shape', async () => {
    await setUp({ webhooks: { limit: 1, windowMs: 60_000 } });
    await request(context.app).post('/webhooks/github').send('{}').expect(400);

    const limited = await request(context.app).post('/webhooks/github').send('{}').expect(429);
    expect(errorFrom(limited).code).toBe('rate_limited');
    expect(limited.headers['retry-after']).toBeDefined();
  });

  it('sends a limited sign-in back to the sign-in page instead of returning JSON', async () => {
    await setUp({ signIn: { limit: 1, windowMs: 60_000 } });
    const first = await request(context.app).get('/api/auth/github/login').expect(302);
    expect(first.headers['location']).toMatch(/^https:\/\/github\.com\/login\/oauth\/authorize/);

    const limited = await request(context.app).get('/api/auth/github/callback').expect(302);
    expect(limited.headers['location']).toBe(`${TEST_APP_URL}/sign-in?error=rate_limited`);
  });
});
