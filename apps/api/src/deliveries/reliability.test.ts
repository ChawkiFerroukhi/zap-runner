import { pino } from 'pino';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { registry } from '../integrations/registry.js';
import { useTestDatabase } from '../testing/database.js';
import { createFakeGitHub, type FakeGitHub } from '../testing/fake-github.js';
import { commentZap, pullRequestPayload, signIn, type SignedInUser } from '../testing/fixtures.js';
import { zapFrom } from '../testing/responses.js';
import { createTestContext, TEST_APP_URL, type TestContext } from '../testing/test-app.js';
import { createZapLookup } from '../zaps/zap-lookup.js';
import { createDeliveriesRepository } from './deliveries.repository.js';
import { DeliveryModel } from './delivery.model.js';
import { createDeliveryRunner } from './delivery-runner.js';
import { sign } from './signature.js';

useTestDatabase();

const COMMENTS = /\/repos\/chawki\/playground\/issues\/42\/comments$/;
const hookRequestSchema = z.object({ config: z.object({ secret: z.string() }) });
const testRunSchema = z.object({
  source: z.enum(['latest-event', 'sample']),
  trigger: z.object({ matched: z.boolean() }),
  resolvedConfig: z.record(z.string(), z.unknown()),
  missingFields: z.array(z.string()),
  problem: z.string().nullable(),
});

describe('delivery reliability', () => {
  let clock: Date;
  let github: FakeGitHub;
  let context: TestContext;
  let user: SignedInUser;
  let zapId: string;
  let hookId: number;
  let secret: string;

  function advance(ms: number): void {
    clock = new Date(clock.getTime() + ms);
  }

  function send(method: 'post' | 'put', path: string, body?: object) {
    const agent = request(context.app);
    return agent[method](path).set('origin', TEST_APP_URL).set('cookie', user.cookie).send(body);
  }

  function deliver(delivery = 'delivery-1') {
    const body = JSON.stringify(pullRequestPayload());
    return request(context.app)
      .post('/webhooks/github')
      .set('content-type', 'application/json')
      .set('x-github-hook-id', String(hookId))
      .set('x-github-event', 'pull_request')
      .set('x-github-delivery', delivery)
      .set('x-hub-signature-256', sign(Buffer.from(body), secret))
      .send(body)
      .expect(202);
  }

  beforeEach(async () => {
    clock = new Date('2026-10-02T09:00:00Z');
    github = createFakeGitHub();
    context = createTestContext({ githubFor: github.githubFor }, { now: () => clock });
    user = await signIn('alice', context.secretBox);
    const created = await send('post', '/api/zaps', commentZap()).expect(201);
    zapId = zapFrom(created).id;
    hookId =
      zapFrom(await send('post', `/api/zaps/${zapId}/enable`).expect(200)).webhook?.hookId ?? 0;
    secret = hookRequestSchema.parse(github.requestsTo('POST', /\/hooks$/)[0]?.body).config.secret;
  });

  it('retries a GitHub outage with backoff and succeeds on a later attempt', async () => {
    github.respond('POST', COMMENTS, 502);
    await deliver();
    await context.runner.drainNow();

    const waiting = await DeliveryModel.findOne().lean();
    expect(waiting).toMatchObject({ status: 'retrying' });
    expect(waiting?.nextAttemptAt?.getTime()).toBe(clock.getTime() + 2_000);
    expect(waiting?.statusReason).toMatch(/Retrying in 2 s \(attempt 2 of 4\)/);

    await context.runner.drainNow();
    expect(github.requestsTo('POST', COMMENTS)).toHaveLength(1);

    advance(2_000);
    await context.runner.drainNow();
    const done = await DeliveryModel.findOne().lean();
    expect(done).toMatchObject({ status: 'succeeded', nextAttemptAt: null });
    expect(done?.attempts.map((attempt) => attempt.outcome)).toEqual(['failed', 'succeeded']);
    expect(github.requestsTo('POST', COMMENTS)).toHaveLength(2);
  });

  it('gives up after the fourth attempt and records every one', async () => {
    github.respond('POST', COMMENTS, 503, { message: 'Unavailable' }, Number.POSITIVE_INFINITY);
    await deliver();
    for (const wait of [0, 2_000, 8_000, 32_000]) {
      advance(wait);
      await context.runner.drainNow();
    }
    const delivery = await DeliveryModel.findOne().lean();
    expect(delivery).toMatchObject({ status: 'failed', nextAttemptAt: null });
    expect(delivery?.attempts).toHaveLength(4);
    expect(github.requestsTo('POST', COMMENTS)).toHaveLength(4);
  });

  it('does not retry a failure that cannot succeed on retry', async () => {
    github.respond('POST', COMMENTS, 404);
    await deliver();
    await context.runner.drainNow();
    const delivery = await DeliveryModel.findOne().lean();
    expect(delivery).toMatchObject({ status: 'failed' });
    expect(delivery?.attempts).toHaveLength(1);
  });

  it('picks up retries left in the database by a previous process', async () => {
    github.respond('POST', COMMENTS, 502);
    await deliver();
    await context.runner.drainNow();
    await context.runner.stop();

    advance(2_000);
    const restarted = createDeliveryRunner({
      registry,
      zaps: createZapLookup(),
      deliveries: createDeliveriesRepository(),
      githubFor: github.githubFor,
      logger: pino({ level: 'silent' }),
      scheduleTimers: false,
      now: () => clock,
    });
    await restarted.drainNow();
    expect(await DeliveryModel.findOne().lean()).toMatchObject({ status: 'succeeded' });
  });

  it('reclaims a run whose worker died mid-attempt once its lease expires', async () => {
    await deliver();
    await context.runner.idle();
    await DeliveryModel.updateOne(
      {},
      {
        status: 'running',
        lockedUntil: new Date(clock.getTime() + 60_000),
        attempts: [],
        completedAt: null,
      },
    );
    const commentsBefore = github.requestsTo('POST', COMMENTS).length;

    await context.runner.drainNow();
    expect(await DeliveryModel.findOne().lean()).toMatchObject({ status: 'running' });
    expect(github.requestsTo('POST', COMMENTS)).toHaveLength(commentsBefore);

    advance(60_000);
    await context.runner.drainNow();
    expect(await DeliveryModel.findOne().lean()).toMatchObject({ status: 'succeeded' });
    expect(github.requestsTo('POST', COMMENTS)).toHaveLength(commentsBefore + 1);
  });

  it('lets only one of two competing workers process a run', async () => {
    await context.runner.stop();
    await deliver();
    const workers = [1, 2].map(() =>
      createDeliveryRunner({
        registry,
        zaps: createZapLookup(),
        deliveries: createDeliveriesRepository(),
        githubFor: github.githubFor,
        logger: pino({ level: 'silent' }),
        scheduleTimers: false,
        now: () => clock,
      }),
    );
    await Promise.all(workers.map((worker) => worker.drainNow()));
    expect(github.requestsTo('POST', COMMENTS)).toHaveLength(1);
  });

  it('replays a failed run as a new run linked to the original', async () => {
    github.respond('POST', COMMENTS, 404);
    await deliver();
    await context.runner.drainNow();
    const original = await DeliveryModel.findOne().lean();

    const replayed = await send(
      'post',
      `/api/zaps/${zapId}/deliveries/${String(original?._id)}/replay`,
    ).expect(202);
    await context.runner.drainNow();
    const copy = await DeliveryModel.findById(
      z.object({ deliveryId: z.string() }).parse(replayed.body).deliveryId,
    ).lean();
    expect(copy).toMatchObject({ source: 'replay', status: 'succeeded' });
    expect(copy?.replayOf?.toString()).toBe(String(original?._id));
  });

  it('refuses to replay another user’s run', async () => {
    await deliver();
    await context.runner.drainNow();
    const original = await DeliveryModel.findOne().lean();
    user = await signIn('bob', context.secretBox);
    await send('post', `/api/zaps/${zapId}/deliveries/${String(original?._id)}/replay`).expect(404);
  });

  it('dry-runs the Zap against its latest event without calling GitHub', async () => {
    const sampled = testRunSchema.parse(
      (await send('post', `/api/zaps/${zapId}/test`).expect(200)).body,
    );
    expect(sampled).toMatchObject({ source: 'sample', trigger: { matched: true }, problem: null });

    await context.runner.stop();
    await deliver();
    const commentsBefore = github.requestsTo('POST', COMMENTS).length;
    const result = testRunSchema.parse(
      (await send('post', `/api/zaps/${zapId}/test`).expect(200)).body,
    );
    expect(result).toMatchObject({
      source: 'latest-event',
      trigger: { matched: true },
      resolvedConfig: { body: 'Thanks @octocat for "Add rate limiting"', number: '42' },
      missingFields: [],
    });
    expect(github.requestsTo('POST', COMMENTS)).toHaveLength(commentsBefore);
  });

  it('uses the most recent event that matches, not just the most recent one', async () => {
    await context.runner.stop();
    await deliver('opened');
    const closed = JSON.stringify(pullRequestPayload({ action: 'closed' }));
    await request(context.app)
      .post('/webhooks/github')
      .set('content-type', 'application/json')
      .set('x-github-hook-id', String(hookId))
      .set('x-github-event', 'pull_request')
      .set('x-github-delivery', 'closed')
      .set('x-hub-signature-256', sign(Buffer.from(closed), secret))
      .send(closed)
      .expect(202);

    const result = testRunSchema.parse(
      (await send('post', `/api/zaps/${zapId}/test`).expect(200)).body,
    );
    expect(result).toMatchObject({ source: 'latest-event', trigger: { matched: true } });
  });
});
