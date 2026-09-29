import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { useTestDatabase } from '../testing/database.js';
import { createFakeGitHub } from '../testing/fake-github.js';
import { commentPayload, commentZap, signIn } from '../testing/fixtures.js';
import { zapFrom } from '../testing/responses.js';
import { createTestContext, TEST_APP_URL } from '../testing/test-app.js';
import { DeliveryModel } from './delivery.model.js';
import { sign } from './signature.js';

useTestDatabase();

const hookRequestSchema = z.object({ config: z.object({ secret: z.string() }) });
const commentRequestSchema = z.object({ body: z.string() });
const COMMENTS = /\/issues\/42\/comments$/;

describe('loop protection', () => {
  it('replies to a human comment once and ignores the reply it posted itself', async () => {
    const github = createFakeGitHub();
    const context = createTestContext({ githubFor: github.githubFor });
    const user = await signIn('alice', context.secretBox);
    const base = commentZap();
    const created = await request(context.app)
      .post('/api/zaps')
      .set('origin', TEST_APP_URL)
      .set('cookie', user.cookie)
      .send({
        name: 'Acknowledge comments',
        trigger: {
          type: 'github.issue_comment.created',
          config: { repository: 'chawki/playground' },
        },
        action: {
          ...base.action,
          config: {
            body: 'Thanks @{{comment.author}}, noted.',
            repository: '{{repo.fullName}}',
            number: '{{issue.number}}',
          },
        },
      })
      .expect(201);
    const zap = zapFrom(
      await request(context.app)
        .post(`/api/zaps/${zapFrom(created).id}/enable`)
        .set('origin', TEST_APP_URL)
        .set('cookie', user.cookie)
        .expect(200),
    );
    const [hook] = github.requestsTo('POST', /\/hooks$/);
    expect(hook?.body).toMatchObject({ events: ['issue_comment'] });
    const secret = hookRequestSchema.parse(hook?.body).config.secret;

    const deliver = (payload: object, delivery: string) => {
      const body = JSON.stringify(payload);
      return request(context.app)
        .post('/webhooks/github')
        .set('content-type', 'application/json')
        .set('x-github-hook-id', String(zap.webhook?.hookId))
        .set('x-github-event', 'issue_comment')
        .set('x-github-delivery', delivery)
        .set('x-hub-signature-256', sign(Buffer.from(body), secret))
        .send(body)
        .expect(202);
    };

    await deliver(commentPayload(), 'human-comment');
    await context.runner.idle();
    const replies = github.requestsTo('POST', COMMENTS);
    expect(replies).toHaveLength(1);
    const reply = commentRequestSchema.parse(replies[0]?.body).body;

    await deliver(commentPayload({ body: reply }), 'own-reply');
    await context.runner.idle();
    expect(github.requestsTo('POST', COMMENTS)).toHaveLength(1);
    expect(await DeliveryModel.findOne({ githubDeliveryId: 'own-reply' }).lean()).toMatchObject({
      status: 'skipped',
      statusReason: 'Comment was posted by a Zap',
    });
  });
});
