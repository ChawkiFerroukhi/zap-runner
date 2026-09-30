import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { useTestDatabase } from '../testing/database.js';
import { createFakeGitHub, type FakeGitHub } from '../testing/fake-github.js';
import { commentZap, signIn, type SignedInUser } from '../testing/fixtures.js';
import { zapFrom, zapsFrom } from '../testing/responses.js';
import { createTestContext, TEST_APP_URL, type TestContext } from '../testing/test-app.js';
import { copyName } from './zap-service.js';

useTestDatabase();

describe('duplicating a Zap', () => {
  let github: FakeGitHub;
  let context: TestContext;
  let user: SignedInUser;

  beforeEach(async () => {
    github = createFakeGitHub();
    context = createTestContext({ githubFor: github.githubFor });
    user = await signIn('alice', context.secretBox);
  });

  function post(path: string, body?: object) {
    return request(context.app)
      .post(path)
      .set('origin', TEST_APP_URL)
      .set('cookie', user.cookie)
      .send(body);
  }

  async function enabledZapId(): Promise<string> {
    const created = await post('/api/zaps', commentZap()).expect(201);
    const zapId = zapFrom(created).id;
    await post(`/api/zaps/${zapId}/enable`).expect(200);
    return zapId;
  }

  it('creates a copy that is off, has no webhook and never calls GitHub', async () => {
    const sourceId = await enabledZapId();
    const callsBefore = github.requests.length;

    const response = await post(`/api/zaps/${sourceId}/duplicate`).expect(201);

    const copy = zapFrom(response);
    expect(copy.id).not.toBe(sourceId);
    expect(copy).toMatchObject({ name: 'Thank PR authors (copy)', enabled: false, webhook: null });
    expect(response.body).toMatchObject({
      draft: false,
      trigger: commentZap().trigger,
      action: commentZap().action,
    });
    expect(github.requests).toHaveLength(callsBefore);
  });

  it('leaves the source Zap on with its webhook', async () => {
    const sourceId = await enabledZapId();
    await post(`/api/zaps/${sourceId}/duplicate`).expect(201);

    const list = await request(context.app).get('/api/zaps').set('cookie', user.cookie).expect(200);
    const source = zapsFrom(list).find((zap) => zap.id === sourceId);
    expect(source).toMatchObject({ enabled: true, webhook: { hookId: 9000 } });
    expect(zapsFrom(list)).toHaveLength(2);
  });

  it('keeps a draft a draft', async () => {
    const created = await post('/api/zaps', commentZap({ draft: true })).expect(201);
    const response = await post(`/api/zaps/${zapFrom(created).id}/duplicate`).expect(201);
    expect(response.body).toMatchObject({ draft: true, enabled: false });
  });

  it('answers 404 for a Zap that does not exist', async () => {
    await post('/api/zaps/000000000000000000000000/duplicate').expect(404);
  });

  it('shortens a long name so the copy still fits', () => {
    const name = copyName('x'.repeat(120));
    expect(name).toHaveLength(120);
    expect(name.endsWith(' (copy)')).toBe(true);
  });
});
