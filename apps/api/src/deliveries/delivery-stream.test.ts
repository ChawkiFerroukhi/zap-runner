import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { useTestDatabase } from '../testing/database.js';
import { createFakeGitHub } from '../testing/fake-github.js';
import { commentZap, pullRequestPayload, signIn } from '../testing/fixtures.js';
import { zapFrom } from '../testing/responses.js';
import { createTestContext, TEST_APP_URL } from '../testing/test-app.js';
import { sign } from './signature.js';

useTestDatabase();

const hookRequestSchema = z.object({ config: z.object({ secret: z.string() }) });

async function readUntil(
  stream: ReadableStream<Uint8Array>,
  done: (text: string) => boolean,
): Promise<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let text = '';
  while (!done(text)) {
    const chunk = await reader.read();
    if (chunk.done) break;
    text += decoder.decode(chunk.value, { stream: true });
  }
  await reader.cancel();
  return text;
}

describe('live delivery stream', () => {
  let server: Server | undefined;

  afterEach(() => {
    server?.close();
  });

  it('pushes each status change of a run to the owner of the Zap', async () => {
    const github = createFakeGitHub();
    const context = createTestContext({ githubFor: github.githubFor });
    const user = await signIn('alice', context.secretBox);
    const created = await request(context.app)
      .post('/api/zaps')
      .set('origin', TEST_APP_URL)
      .set('cookie', user.cookie)
      .send(commentZap())
      .expect(201);
    const zap = zapFrom(
      await request(context.app)
        .post(`/api/zaps/${zapFrom(created).id}/enable`)
        .set('origin', TEST_APP_URL)
        .set('cookie', user.cookie)
        .expect(200),
    );
    const secret = hookRequestSchema.parse(github.requestsTo('POST', /\/hooks$/)[0]?.body).config
      .secret;

    server = context.app.listen(0);
    const { port } = z
      .custom<AddressInfo>((value) => typeof value === 'object')
      .parse(server.address());
    const stream = await fetch(`http://127.0.0.1:${port}/api/zaps/${zap.id}/events`, {
      headers: { cookie: user.cookie },
    });
    expect(stream.headers.get('content-type')).toMatch(/^text\/event-stream/);

    const body = JSON.stringify(pullRequestPayload());
    await request(context.app)
      .post('/webhooks/github')
      .set('content-type', 'application/json')
      .set('x-github-hook-id', String(zap.webhook?.hookId))
      .set('x-github-event', 'pull_request')
      .set('x-github-delivery', 'live-1')
      .set('x-hub-signature-256', sign(Buffer.from(body), secret))
      .send(body)
      .expect(202);

    const text = await readUntil(stream.body ?? new ReadableStream(), (received) =>
      received.includes('"status":"succeeded"'),
    );
    const statuses = [...text.matchAll(/"status":"(\w+)"/g)].map((match) => match[1]);
    expect(statuses).toEqual(['queued', 'running', 'succeeded']);
  });

  it('refuses to stream another user’s Zap', async () => {
    const context = createTestContext({ githubFor: createFakeGitHub().githubFor });
    const alice = await signIn('alice', context.secretBox);
    const bob = await signIn('bob', context.secretBox);
    const created = await request(context.app)
      .post('/api/zaps')
      .set('origin', TEST_APP_URL)
      .set('cookie', alice.cookie)
      .send(commentZap())
      .expect(201);
    await request(context.app)
      .get(`/api/zaps/${zapFrom(created).id}/events`)
      .set('cookie', bob.cookie)
      .expect(404);
  });
});
