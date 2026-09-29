import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { sign } from '../deliveries/signature.js';
import { useTestDatabase } from '../testing/database.js';
import { createFakeGitHub, type FakeGitHub } from '../testing/fake-github.js';
import { commentZap, pullRequestPayload, signIn, type SignedInUser } from '../testing/fixtures.js';
import { zapFrom } from '../testing/responses.js';
import { createTestContext, TEST_APP_URL, type TestContext } from '../testing/test-app.js';

useTestDatabase();

const SAMPLE_URL = '/api/triggers/github.pull_request.opened/sample';
const sampleSchema = z.object({
  source: z.enum(['latest-event', 'sample']),
  fields: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])),
});
const hookRequestSchema = z.object({ config: z.object({ secret: z.string() }) });

describe('trigger preview sample', () => {
  let github: FakeGitHub;
  let context: TestContext;
  let alice: SignedInUser;

  beforeEach(async () => {
    github = createFakeGitHub();
    context = createTestContext({ githubFor: github.githubFor });
    alice = await signIn('alice', context.secretBox);
  });

  async function receiveRealEvent(): Promise<void> {
    const created = await request(context.app)
      .post('/api/zaps')
      .set('origin', TEST_APP_URL)
      .set('cookie', alice.cookie)
      .send(commentZap())
      .expect(201);
    const zap = zapFrom(
      await request(context.app)
        .post(`/api/zaps/${zapFrom(created).id}/enable`)
        .set('origin', TEST_APP_URL)
        .set('cookie', alice.cookie)
        .expect(200),
    );
    const secret = hookRequestSchema.parse(github.requestsTo('POST', /\/hooks$/)[0]?.body).config
      .secret;
    const body = JSON.stringify(pullRequestPayload({ number: 7 }));
    await request(context.app)
      .post('/webhooks/github')
      .set('content-type', 'application/json')
      .set('x-github-hook-id', String(zap.webhook?.hookId))
      .set('x-github-event', 'pull_request')
      .set('x-github-delivery', 'real-event')
      .set('x-hub-signature-256', sign(Buffer.from(body), secret))
      .send(body)
      .expect(202);
    await context.runner.idle();
  }

  it('falls back to the built-in sample before any real event arrives', async () => {
    const response = await request(context.app)
      .get(SAMPLE_URL)
      .set('cookie', alice.cookie)
      .expect(200);
    expect(sampleSchema.parse(response.body).source).toBe('sample');
  });

  it('uses the latest real event the user’s Zaps received', async () => {
    await receiveRealEvent();
    const response = await request(context.app)
      .get(SAMPLE_URL)
      .set('cookie', alice.cookie)
      .expect(200);
    expect(sampleSchema.parse(response.body)).toMatchObject({
      source: 'latest-event',
      fields: { 'pr.number': 7, 'repo.fullName': 'chawki/playground' },
    });
  });

  it('never shows one user’s events to another', async () => {
    await receiveRealEvent();
    const bob = await signIn('bob', context.secretBox);
    const response = await request(context.app)
      .get(SAMPLE_URL)
      .set('cookie', bob.cookie)
      .expect(200);
    expect(sampleSchema.parse(response.body).source).toBe('sample');
  });
});
