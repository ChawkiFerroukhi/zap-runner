import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { useTestDatabase } from '../testing/database.js';
import { createFakeGitHub } from '../testing/fake-github.js';
import { signIn } from '../testing/fixtures.js';
import { createTestContext, TEST_APP_URL } from '../testing/test-app.js';
import { ZapModel } from '../zaps/zap.model.js';
import type { CopilotAnswer, CopilotModel } from './copilot-model.js';

useTestDatabase();

const KEY = 'test-valid-copilot-key-0000-abcd';

function heldModel() {
  let release: (answer: CopilotAnswer) => void = () => undefined;
  let reached: () => void = () => undefined;
  const modelReached = new Promise<void>((resolve) => {
    reached = resolve;
  });
  const model: CopilotModel = {
    provider: {
      id: 'gemini',
      name: 'Test',
      models: ['test'],
      keyUrl: 'https://keys.test',
      pricing: 'free-tier',
    },
    verifyKey: () => Promise.resolve(),
    draft: () =>
      new Promise<CopilotAnswer>((resolve) => {
        release = resolve;
        reached();
      }),
  };
  return {
    model,
    modelReached,
    release: (answer: CopilotAnswer) => {
      release(answer);
    },
  };
}

describe('cancelling a copilot draft', () => {
  let server: Server | undefined;

  afterEach(() => {
    server?.close();
  });

  it('saves nothing when the browser disconnects before the model answers', async () => {
    const github = createFakeGitHub();
    github.respond('GET', /^\/user\/repos$/, 200, [
      { full_name: 'chawki/playground', private: false, permissions: { admin: true } },
    ]);
    const held = heldModel();
    const context = createTestContext(
      { githubFor: github.githubFor },
      { copilotModel: held.model },
    );
    const user = await signIn('alice', context.secretBox);
    await request(context.app)
      .put('/api/copilot/key')
      .set('origin', TEST_APP_URL)
      .set('cookie', user.cookie)
      .send({ provider: 'gemini', apiKey: KEY })
      .expect(200);

    server = context.app.listen(0);
    const { port } = z
      .custom<AddressInfo>((value) => typeof value === 'object')
      .parse(server.address());
    const browser = new AbortController();
    const response = fetch(`http://127.0.0.1:${port}/api/copilot/drafts`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: TEST_APP_URL, cookie: user.cookie },
      body: JSON.stringify({ prompt: 'Comment thanks on new PRs in playground' }),
      signal: browser.signal,
    }).catch((error: unknown) => error);

    await held.modelReached;
    browser.abort();
    await response;
    await new Promise((resolve) => setTimeout(resolve, 50));

    held.release({
      model: 'test',
      draft: {
        status: 'ready',
        explanation: 'Thanks authors.',
        question: '',
        name: 'Thank authors',
        triggerId: 'github.pull_request.opened',
        triggerConfig: [{ key: 'repository', value: 'chawki/playground' }],
        actionId: 'github.comment',
        actionConfig: [
          { key: 'body', value: 'Thanks @{{pr.author}}' },
          { key: 'repository', value: '{{repo.fullName}}' },
          { key: 'number', value: '{{pr.number}}' },
        ],
      },
    });
    await new Promise((resolve) => setTimeout(resolve, 200));

    expect(await ZapModel.countDocuments()).toBe(0);
  });
});
