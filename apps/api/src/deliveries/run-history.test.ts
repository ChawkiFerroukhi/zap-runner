import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { useTestDatabase } from '../testing/database.js';
import { createFakeGitHub } from '../testing/fake-github.js';
import { commentZap, pullRequestPayload, signIn, type SignedInUser } from '../testing/fixtures.js';
import { zapFrom } from '../testing/responses.js';
import { createTestContext, TEST_APP_URL, type TestContext } from '../testing/test-app.js';
import { DeliveryModel } from './delivery.model.js';

useTestDatabase();

const pageSchema = z.object({
  items: z.array(
    z.object({
      id: z.string(),
      status: z.string(),
      subject: z.object({ label: z.string(), url: z.string() }).nullable(),
    }),
  ),
  nextCursor: z.string().nullable(),
  counts: z.object({
    runs: z.number(),
    succeeded: z.number(),
    failed: z.number(),
    retrying: z.number(),
    skipped: z.number(),
  }),
});

describe('run history', () => {
  let context: TestContext;
  let user: SignedInUser;
  let zapId: string;

  async function seed(
    status: 'succeeded' | 'failed' | 'retrying' | 'skipped',
    hoursAgo: number,
    number = 42,
  ): Promise<void> {
    const receivedAt = new Date(Date.now() - hoursAgo * 3_600_000);
    await DeliveryModel.create({
      zapId,
      userId: user.userId,
      githubDeliveryId: `seed-${status}-${String(hoursAgo)}-${String(number)}`,
      source: 'webhook',
      event: 'pull_request',
      payload: pullRequestPayload({ number }),
      status,
      receivedAt,
      nextAttemptAt: null,
    });
  }

  async function page(query: string, as = user) {
    const response = await request(context.app)
      .get(`/api/zaps/${zapId}/deliveries?${query}`)
      .set('cookie', as.cookie)
      .expect(200);
    return pageSchema.parse(response.body);
  }

  beforeEach(async () => {
    context = createTestContext({ githubFor: createFakeGitHub().githubFor });
    user = await signIn('alice', context.secretBox);
    const created = await request(context.app)
      .post('/api/zaps')
      .set('origin', TEST_APP_URL)
      .set('cookie', user.cookie)
      .send(commentZap())
      .expect(201);
    zapId = zapFrom(created).id;
    await seed('succeeded', 1, 1);
    await seed('succeeded', 2, 2);
    await seed('failed', 3, 3);
    await seed('retrying', 4, 4);
    await seed('skipped', 5, 5);
    await seed('succeeded', 24 * 10, 6);
  });

  it('counts runs by status within the range and keeps skipped events apart', async () => {
    const recent = await page('range=7d');
    expect(recent.counts).toEqual({ runs: 4, succeeded: 2, failed: 1, retrying: 1, skipped: 1 });
    expect(recent.items.map((item) => item.status)).not.toContain('skipped');

    const all = await page('range=all');
    expect(all.counts).toMatchObject({ runs: 5, succeeded: 3 });
  });

  it('filters by status', async () => {
    expect((await page('filter=failed&range=all')).items.map((item) => item.status)).toEqual([
      'failed',
    ]);
    expect((await page('filter=skipped&range=all')).items.map((item) => item.status)).toEqual([
      'skipped',
    ]);
  });

  it('pages back with a cursor without repeating or skipping runs', async () => {
    const first = await page('range=all&limit=2');
    expect(first.items).toHaveLength(2);
    const second = await page(`range=all&limit=2&cursor=${first.nextCursor ?? ''}`);
    const third = await page(`range=all&limit=2&cursor=${second.nextCursor ?? ''}`);
    expect(third.nextCursor).toBeNull();
    const ids = [...first.items, ...second.items, ...third.items].map((item) => item.id);
    expect(new Set(ids).size).toBe(5);
  });

  it('links each run to the pull request it is about', async () => {
    const [latest] = (await page('range=all')).items;
    expect(latest?.subject).toEqual({
      label: 'PR #1',
      url: 'https://github.com/chawki/playground/pull/1',
    });
  });

  it('serves the raw payload only to the owner of the Zap', async () => {
    const [latest] = (await page('range=all')).items;
    const path = `/api/zaps/${zapId}/deliveries/${latest?.id ?? ''}/payload`;
    const owned = await request(context.app).get(path).set('cookie', user.cookie).expect(200);
    expect(owned.body).toMatchObject({ payload: { action: 'opened', number: 1 } });

    const bob = await signIn('bob', context.secretBox);
    await request(context.app).get(path).set('cookie', bob.cookie).expect(404);
  });

  it('shows the latest run that acted on each Zap in the Zap list, ignoring skipped events', async () => {
    const response = await request(context.app)
      .get('/api/zaps')
      .set('cookie', user.cookie)
      .expect(200);
    const [zap] = z
      .array(
        z.object({ lastRun: z.object({ status: z.string(), receivedAt: z.string() }).nullable() }),
      )
      .parse(response.body);
    expect(zap?.lastRun?.status).toBe('succeeded');
  });

  it('lists runs across every Zap and narrows to one on request', async () => {
    const other = await request(context.app)
      .post('/api/zaps')
      .set('origin', TEST_APP_URL)
      .set('cookie', user.cookie)
      .send(commentZap({ name: 'Second Zap' }))
      .expect(201);
    const otherId = zapFrom(other).id;
    await DeliveryModel.create({
      zapId: otherId,
      userId: user.userId,
      githubDeliveryId: 'other-zap-run',
      source: 'webhook',
      event: 'pull_request',
      payload: pullRequestPayload({ number: 9 }),
      status: 'failed',
      receivedAt: new Date(),
    });

    const all = pageSchema.parse(
      (await request(context.app).get('/api/runs?range=7d').set('cookie', user.cookie).expect(200))
        .body,
    );
    expect(all.counts).toMatchObject({ runs: 5, failed: 2 });

    const one = pageSchema.parse(
      (
        await request(context.app)
          .get(`/api/runs?range=7d&zapId=${otherId}`)
          .set('cookie', user.cookie)
          .expect(200)
      ).body,
    );
    expect(one.items.map((item) => item.status)).toEqual(['failed']);

    const bob = await signIn('bob', context.secretBox);
    await request(context.app)
      .get(`/api/runs?zapId=${otherId}`)
      .set('cookie', bob.cookie)
      .expect(404);
  });

  it('rejects an unknown filter', async () => {
    await request(context.app)
      .get(`/api/zaps/${zapId}/deliveries?filter=everything`)
      .set('cookie', user.cookie)
      .expect(400);
  });
});
