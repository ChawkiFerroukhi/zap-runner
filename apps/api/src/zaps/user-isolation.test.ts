import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { useTestDatabase } from '../testing/database.js';
import { zapFrom, zapsFrom } from '../testing/responses.js';
import { createFakeGitHub } from '../testing/fake-github.js';
import { commentZap, signIn, type SignedInUser } from '../testing/fixtures.js';
import { createTestContext, TEST_APP_URL, type TestContext } from '../testing/test-app.js';

useTestDatabase();

describe('user isolation', () => {
  let context: TestContext;
  let alice: SignedInUser;
  let bob: SignedInUser;
  let aliceZapId: string;

  beforeEach(async () => {
    context = createTestContext({ githubFor: createFakeGitHub().githubFor });
    alice = await signIn('alice', context.secretBox);
    bob = await signIn('bob', context.secretBox);
    const created = await request(context.app)
      .post('/api/zaps')
      .set('origin', TEST_APP_URL)
      .set('cookie', alice.cookie)
      .send(commentZap())
      .expect(201);
    aliceZapId = zapFrom(created).id;
  });

  it('lists only the signed-in user’s Zaps', async () => {
    const own = await request(context.app).get('/api/zaps').set('cookie', alice.cookie).expect(200);
    const other = await request(context.app).get('/api/zaps').set('cookie', bob.cookie).expect(200);
    expect(zapsFrom(own)).toHaveLength(1);
    expect(zapsFrom(other)).toEqual([]);
  });

  it.each([
    ['get', 'get', ''],
    ['update', 'put', ''],
    ['enable', 'post', '/enable'],
    ['disable', 'post', '/disable'],
    ['delete', 'delete', ''],
    ['duplicate', 'post', '/duplicate'],
    ['list deliveries of', 'get', '/deliveries'],
  ] as const)('answers 404 when another user tries to %s a Zap', async (_verb, method, suffix) => {
    const agent = request(context.app);
    await agent[method](`/api/zaps/${aliceZapId}${suffix}`)
      .set('origin', TEST_APP_URL)
      .set('cookie', bob.cookie)
      .send(commentZap({ name: 'Hijacked' }))
      .expect(404);
  });

  it('leaves the owner’s Zap untouched after those attempts', async () => {
    await request(context.app)
      .put(`/api/zaps/${aliceZapId}`)
      .set('origin', TEST_APP_URL)
      .set('cookie', bob.cookie)
      .send(commentZap({ name: 'Hijacked' }))
      .expect(404);
    const zap = await request(context.app)
      .get(`/api/zaps/${aliceZapId}`)
      .set('cookie', alice.cookie)
      .expect(200);
    expect(zapFrom(zap)).toMatchObject({ name: 'Thank PR authors', enabled: false });
  });

  it('requires a session for every Zap route', async () => {
    await request(context.app).get('/api/zaps').expect(401);
    await request(context.app).get(`/api/zaps/${aliceZapId}`).expect(401);
  });
});
