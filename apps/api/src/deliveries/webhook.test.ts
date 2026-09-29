import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { useTestDatabase } from '../testing/database.js';
import { zapFrom } from '../testing/responses.js';
import { createFakeGitHub, type FakeGitHub } from '../testing/fake-github.js';
import { commentZap, pullRequestPayload, signIn } from '../testing/fixtures.js';
import { createTestContext, TEST_APP_URL, type TestContext } from '../testing/test-app.js';
import { ZapModel } from '../zaps/zap.model.js';
import { DeliveryModel } from './delivery.model.js';
import { sign } from './signature.js';

useTestDatabase();

const hookRequestSchema = z.object({ config: z.object({ secret: z.string().min(1) }) });

const commentBodySchema = z.object({ body: z.string() });

const COMMENTS = /\/repos\/chawki\/playground\/issues\/42\/comments$/;

describe('github webhook delivery', () => {
  let github: FakeGitHub;
  let context: TestContext;
  let hookId: number;
  let secret: string;

  beforeEach(async () => {
    github = createFakeGitHub();
    context = createTestContext({ githubFor: github.githubFor });
    const user = await signIn('alice', context.secretBox);
    const created = await request(context.app)
      .post('/api/zaps')
      .set('origin', TEST_APP_URL)
      .set('cookie', user.cookie)
      .send(commentZap())
      .expect(201);
    const enabled = await request(context.app)
      .post(`/api/zaps/${zapFrom(created).id}/enable`)
      .set('origin', TEST_APP_URL)
      .set('cookie', user.cookie)
      .expect(200);
    hookId = zapFrom(enabled).webhook?.hookId ?? 0;
    const [hookRequest] = github.requestsTo('POST', /\/hooks$/);
    secret = hookRequestSchema.parse(hookRequest?.body).config.secret;
  });

  function deliver(
    event: string,
    payload: object,
    options: { delivery?: string; signature?: string } = {},
  ) {
    const body = JSON.stringify(payload);
    return request(context.app)
      .post('/webhooks/github')
      .set('content-type', 'application/json')
      .set('x-github-hook-id', String(hookId))
      .set('x-github-event', event)
      .set('x-github-delivery', options.delivery ?? 'delivery-1')
      .set('x-hub-signature-256', options.signature ?? sign(Buffer.from(body), secret))
      .send(body);
  }

  it('comments on the pull request with the template resolved from the event', async () => {
    await deliver('pull_request', pullRequestPayload()).expect(202);
    await context.runner.idle();

    const comments = github.requestsTo('POST', COMMENTS);
    expect(comments).toHaveLength(1);
    expect(commentBodySchema.parse(comments[0]?.body).body).toMatch(
      /^Thanks @octocat for "Add rate limiting"\n\n<!-- zap-runner zap=\w+ -->$/,
    );

    const delivery = await DeliveryModel.findOne().lean();
    expect(delivery).toMatchObject({ status: 'succeeded', missingFields: [] });
    expect(delivery?.attempts).toHaveLength(1);
  });

  it('rejects a bad signature before storing anything or calling GitHub', async () => {
    await deliver('pull_request', pullRequestPayload(), {
      signature: `sha256=${'0'.repeat(64)}`,
    }).expect(401);
    await context.runner.idle();
    expect(await DeliveryModel.countDocuments()).toBe(0);
    expect(github.requestsTo('POST', COMMENTS)).toHaveLength(0);
  });

  it('rejects a body altered after signing', async () => {
    const signed = sign(Buffer.from(JSON.stringify(pullRequestPayload())), secret);
    await deliver('pull_request', pullRequestPayload({ number: 43 }), { signature: signed }).expect(
      401,
    );
  });

  it('ignores a redelivery with the same delivery id so the comment is posted once', async () => {
    await deliver('pull_request', pullRequestPayload(), { delivery: 'same-id' }).expect(202);
    await deliver('pull_request', pullRequestPayload(), { delivery: 'same-id' }).expect(200, {
      status: 'duplicate',
    });
    await context.runner.idle();
    expect(github.requestsTo('POST', COMMENTS)).toHaveLength(1);
    expect(await DeliveryModel.countDocuments()).toBe(1);
  });

  it('records a non-matching event as skipped without commenting', async () => {
    await deliver('pull_request', pullRequestPayload({ action: 'closed' })).expect(202);
    await context.runner.idle();
    expect(github.requestsTo('POST', COMMENTS)).toHaveLength(0);
    expect(await DeliveryModel.findOne().lean()).toMatchObject({ status: 'skipped' });
  });

  it('records a GitHub outage as a retryable failure', async () => {
    github.respond('POST', COMMENTS, 502);
    await deliver('pull_request', pullRequestPayload()).expect(202);
    await context.runner.idle();
    const delivery = await DeliveryModel.findOne().lean();
    expect(delivery).toMatchObject({ status: 'failed' });
    expect(delivery?.attempts[0]).toMatchObject({ outcome: 'failed', retryable: true });
  });

  it('answers the ping GitHub sends on creation and marks the webhook verified', async () => {
    await deliver('ping', { zen: 'Design for failure.' }).expect(200);
    const zap = await ZapModel.findOne({ 'webhook.hookId': hookId }).lean();
    expect(zap?.webhook?.verifiedAt).toBeInstanceOf(Date);
  });

  it('refuses deliveries for a webhook no Zap owns', async () => {
    hookId = 1;
    await deliver('pull_request', pullRequestPayload()).expect(404);
  });
});
