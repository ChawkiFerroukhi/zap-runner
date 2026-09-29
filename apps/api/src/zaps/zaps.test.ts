import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { useTestDatabase } from '../testing/database.js';
import { errorFrom, zapFrom } from '../testing/responses.js';
import { createFakeGitHub, type FakeGitHub } from '../testing/fake-github.js';
import { commentZap, signIn, type SignedInUser } from '../testing/fixtures.js';
import { createTestContext, TEST_APP_URL, type TestContext } from '../testing/test-app.js';
import { ZapModel } from './zap.model.js';

useTestDatabase();

describe('zap lifecycle', () => {
  let github: FakeGitHub;
  let context: TestContext;
  let user: SignedInUser;

  beforeEach(async () => {
    github = createFakeGitHub();
    context = createTestContext({ githubFor: github.githubFor });
    user = await signIn('alice', context.secretBox);
  });

  function send(method: 'post' | 'put', path: string, body?: object) {
    const agent = request(context.app);
    return agent[method](path).set('origin', TEST_APP_URL).set('cookie', user.cookie).send(body);
  }

  it('rejects a template that references a field the trigger does not provide', async () => {
    const zap = commentZap();
    const response = await send('post', '/api/zaps', {
      ...zap,
      action: { ...zap.action, config: { ...zap.action.config, body: 'Hi {{pr.reviewer}}' } },
    }).expect(400);
    expect(errorFrom(response).fields).toEqual({
      'action.config.body': 'Unknown field {{pr.reviewer}}',
    });
  });

  it('registers a webhook with its own secret when enabled and removes it when disabled', async () => {
    const created = await send('post', '/api/zaps', commentZap()).expect(201);
    const zapId = zapFrom(created).id;

    const enabled = await send('post', `/api/zaps/${zapId}/enable`).expect(200);
    expect(zapFrom(enabled)).toMatchObject({
      enabled: true,
      webhook: { hookId: 9000, repository: 'chawki/playground' },
    });

    const [hook] = github.requestsTo('POST', /\/repos\/chawki\/playground\/hooks$/);
    expect(hook?.body).toMatchObject({
      events: ['pull_request'],
      config: { url: `https://hooks.test/github?zap=${zapId}`, content_type: 'json' },
    });
    const stored = await ZapModel.findById(zapId).lean();
    expect(stored?.webhook?.secret).toMatch(/^v1\./);

    const disabled = await send('post', `/api/zaps/${zapId}/disable`).expect(200);
    expect(zapFrom(disabled)).toMatchObject({ enabled: false, webhook: null });
    expect(github.requestsTo('DELETE', /\/hooks\/9000$/)).toHaveLength(1);
  });

  it('stays disabled and explains why when GitHub refuses the webhook', async () => {
    github.respond('POST', /\/hooks$/, 404);
    const created = await send('post', '/api/zaps', commentZap()).expect(201);

    const response = await send('post', `/api/zaps/${zapFrom(created).id}/enable`).expect(422);
    expect(errorFrom(response).message).toMatch(/not an admin/);
    expect(await ZapModel.findById(zapFrom(created).id).lean()).toMatchObject({
      enabled: false,
      webhook: null,
    });
  });

  it('treats a webhook already deleted on GitHub as removed', async () => {
    const created = await send('post', '/api/zaps', commentZap()).expect(201);
    await send('post', `/api/zaps/${zapFrom(created).id}/enable`).expect(200);
    github.respond('DELETE', /\/hooks\/\d+$/, 404);
    await send('post', `/api/zaps/${zapFrom(created).id}/disable`).expect(200);
  });
});
