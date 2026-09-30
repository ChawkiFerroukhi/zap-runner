import type { CopilotEvent } from '@zap-runner/shared';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { useTestDatabase } from '../testing/database.js';
import { createFakeGitHub, type FakeGitHub } from '../testing/fake-github.js';
import { signIn, type SignedInUser } from '../testing/fixtures.js';
import { errorFrom } from '../testing/responses.js';
import { createTestContext, TEST_APP_URL, type TestContext } from '../testing/test-app.js';
import { UserModel } from '../users/user.model.js';
import { ZapModel } from '../zaps/zap.model.js';
import {
  CopilotKeyRejected,
  type CopilotDraft,
  type CopilotModel,
  type CopilotRequest,
} from './copilot-model.js';

useTestDatabase();

const VALID_KEY = 'test-valid-copilot-key-0000-abcd';

const statusSchema = z.object({
  provider: z.object({ id: z.string(), name: z.string() }).nullable(),
  configured: z.boolean(),
  source: z.enum(['account', 'server']).nullable(),
  keyHint: z.string().nullable(),
});

function draftFor(repository: string, overrides: Partial<CopilotDraft> = {}): CopilotDraft {
  return {
    status: 'ready',
    explanation: 'Comments on every new pull request.',
    question: '',
    name: 'Thank PR authors',
    triggerId: 'github.pull_request.opened',
    triggerConfig: [
      { key: 'repository', value: repository },
      { key: 'ignoreDrafts', value: false },
    ],
    actionId: 'github.comment',
    actionConfig: [
      { key: 'body', value: 'Thanks @{{pr.author}}!' },
      { key: 'repository', value: '{{repo.fullName}}' },
      { key: 'number', value: '{{pr.number}}' },
    ],
    ...overrides,
  };
}

interface ScriptedModel extends CopilotModel {
  requests: CopilotRequest[];
}

function scriptedModel(drafts: CopilotDraft[]): ScriptedModel {
  const requests: CopilotRequest[] = [];
  return {
    requests,
    provider: {
      id: 'gemini',
      name: 'Test provider',
      models: ['test-model', 'test-model-backup'],
      keyUrl: 'https://keys.test',
      pricing: 'free-tier',
    },
    verifyKey: (apiKey) =>
      apiKey === VALID_KEY ? Promise.resolve() : Promise.reject(new CopilotKeyRejected('rejected')),
    draft: (_apiKey, copilotRequest, observer) => {
      requests.push(copilotRequest);
      observer?.fallback('test-model', 'test-model-backup', 'overloaded');
      const next = drafts.shift();
      return next
        ? Promise.resolve({ draft: next, model: 'test-model-backup' })
        : Promise.reject(new Error('No scripted draft left'));
    },
  };
}

function parseEvents(text: string): CopilotEvent[] {
  return text
    .split('\n\n')
    .map((frame) => frame.split('\n').find((line) => line.startsWith('data: ')))
    .filter((line): line is string => line !== undefined)
    .map((line): unknown => JSON.parse(line.slice('data: '.length)))
    .filter(isEvent);
}

function isEvent(value: unknown): value is CopilotEvent {
  return (
    typeof value === 'object' && value !== null && 'type' in value && typeof value.type === 'string'
  );
}

function pendingIdOf(events: CopilotEvent[]): string {
  const last = events.at(-1);
  return last?.type === 'question' ? last.question.pendingId : '';
}

describe('copilot', () => {
  let github: FakeGitHub;
  let model: ScriptedModel;
  let context: TestContext;
  let user: SignedInUser;

  function setup(
    drafts: CopilotDraft[],
    serverCopilotKey?: { provider: 'gemini'; apiKey: string },
  ) {
    github = createFakeGitHub();
    github.respond(
      'GET',
      /^\/user\/repos$/,
      200,
      [
        { full_name: 'chawki/playground', private: false, permissions: { admin: true } },
        { full_name: 'chawki/website', private: false, permissions: { admin: true } },
        { full_name: 'chawki/read-only', private: false, permissions: { admin: false } },
      ],
      Number.POSITIVE_INFINITY,
    );
    model = scriptedModel(drafts);
    context = createTestContext(
      { githubFor: github.githubFor },
      { copilotModel: model, ...(serverCopilotKey ? { serverCopilotKey } : {}) },
    );
  }

  function send(method: 'put' | 'post' | 'delete', path: string, body?: object) {
    const agent = request(context.app);
    return agent[method](path).set('origin', TEST_APP_URL).set('cookie', user.cookie).send(body);
  }

  async function stream(body: object): Promise<CopilotEvent[]> {
    const response = await request(context.app)
      .post('/api/copilot/drafts')
      .set('origin', TEST_APP_URL)
      .set('cookie', user.cookie)
      .send(body)
      .buffer(true)
      .parse((res, done) => {
        let text = '';
        res.setEncoding('utf8');
        res.on('data', (chunk: string) => (text += chunk));
        res.on('end', () => {
          done(null, text);
        });
      })
      .expect(200);
    const text: unknown = response.body;
    return parseEvents(typeof text === 'string' ? text : '');
  }

  async function withKey(drafts: CopilotDraft[]): Promise<void> {
    setup(drafts);
    user = await signIn('alice', context.secretBox);
    await send('put', '/api/copilot/key', { provider: 'gemini', apiKey: VALID_KEY }).expect(200);
  }

  beforeEach(async () => {
    setup([]);
    user = await signIn('alice', context.secretBox);
  });

  describe('keys', () => {
    it('stores a verified key encrypted and only ever reveals its last characters', async () => {
      const saved = statusSchema.parse(
        (
          await send('put', '/api/copilot/key', { provider: 'gemini', apiKey: VALID_KEY }).expect(
            200,
          )
        ).body,
      );
      expect(saved).toMatchObject({
        configured: true,
        source: 'account',
        keyHint: '…abcd',
        provider: { id: 'gemini' },
      });

      const stored = await UserModel.findById(user.userId).lean();
      expect(stored?.copilotKey).toMatch(/^v1\./);
      expect(stored?.copilotKey).not.toContain(VALID_KEY);

      const removed = statusSchema.parse(
        (await send('delete', '/api/copilot/key').expect(200)).body,
      );
      expect(removed.configured).toBe(false);
    });

    it('rejects a provider the server does not know', async () => {
      await send('put', '/api/copilot/key', { provider: 'unknown', apiKey: VALID_KEY }).expect(400);
    });

    it('refuses to store a key the provider rejects', async () => {
      const response = await send('put', '/api/copilot/key', {
        provider: 'gemini',
        apiKey: 'test-key-that-is-not-valid',
      }).expect(400);
      expect(errorFrom(response).fields).toEqual({ apiKey: 'The provider rejected this key' });
      expect((await UserModel.findById(user.userId).lean())?.copilotKey).toBeNull();
    });

    it('falls back to a key configured on the server', async () => {
      setup([], { provider: 'gemini', apiKey: 'test-server-key-0000-wxyz' });
      user = await signIn('alice', context.secretBox);
      const response = await request(context.app)
        .get('/api/copilot/status')
        .set('cookie', user.cookie)
        .expect(200);
      expect(statusSchema.parse(response.body)).toMatchObject({
        configured: true,
        source: 'server',
        keyHint: '…wxyz',
      });
    });
  });

  describe('drafting', () => {
    it('explains how to enable drafting when no key is configured', async () => {
      const response = await send('post', '/api/copilot/drafts', {
        prompt: 'Comment thanks on new PRs',
      }).expect(409);
      expect(errorFrom(response).code).toBe('copilot_not_configured');
    });

    it('streams each step and saves the Zap turned off for review', async () => {
      await withKey([draftFor('chawki/playground')]);
      const events = await stream({ prompt: 'When a pull request is opened, comment thanks.' });

      expect(
        events
          .filter((event) => event.type === 'step')
          .map((event) => `${event.step}:${event.state}`),
      ).toEqual([
        'repositories:active',
        'repositories:done',
        'model:active',
        'model:done',
        'check:active',
        'check:done',
        'save:active',
        'save:done',
      ]);
      expect(events).toContainEqual({
        type: 'note',
        step: 'model',
        message: 'test-model is overloaded, trying test-model-backup',
      });
      expect(events.at(-1)).toMatchObject({
        type: 'drafted',
        model: 'test-model-backup',
        zap: { enabled: false, draft: true },
      });
      expect(github.requestsTo('POST', /\/hooks$/)).toHaveLength(0);
      expect(model.requests[0]?.repositories).toEqual(['chawki/playground', 'chawki/website']);
    });

    it('asks which repository to use and finishes from the held draft without asking the model again', async () => {
      await withKey([
        draftFor('', {
          status: 'needs_repository',
          question: 'Which repository should this watch?',
        }),
      ]);
      const first = await stream({ prompt: 'Thank authors of new PRs' });
      const question = first.at(-1);
      expect(question).toMatchObject({
        type: 'question',
        question: { kind: 'repository', options: ['chawki/playground', 'chawki/website'] },
      });
      expect(await ZapModel.countDocuments()).toBe(0);

      const pendingId = question?.type === 'question' ? question.question.pendingId : '';
      const second = await stream({
        prompt: 'Thank authors of new PRs',
        answer: { pendingId, value: 'chawki/website' },
      });
      expect(second).toContainEqual(
        expect.objectContaining({ type: 'step', step: 'model', state: 'skipped' }),
      );
      expect(second.at(-1)).toMatchObject({ type: 'drafted' });
      expect(model.requests).toHaveLength(1);
      expect(second.at(-1)).toMatchObject({
        explanation: 'Pull request opened on chawki/website, then comment on the pull request.',
      });
      expect((await ZapModel.findOne().lean())?.trigger.config).toMatchObject({
        repository: 'chawki/website',
      });
    });

    it('only accepts a repository from the offered list', async () => {
      await withKey([draftFor('', { status: 'needs_repository', question: 'Which repository?' })]);
      const first = await stream({ prompt: 'Thank authors of new PRs' });
      const pendingId = pendingIdOf(first);
      const second = await stream({
        prompt: 'Thank authors of new PRs',
        answer: { pendingId, value: 'chawki/read-only' },
      });
      expect(second.at(-1)).toMatchObject({ type: 'failed', code: 'copilot_invalid_answer' });
    });

    it('sends a clarifying answer back to the model together with the original description', async () => {
      await withKey([
        draftFor('chawki/playground', {
          status: 'needs_clarification',
          question: 'Opened or merged?',
        }),
        draftFor('chawki/playground'),
      ]);
      const first = await stream({ prompt: 'Thank people for their pull requests on playground' });
      const last = first.at(-1);
      expect(last).toMatchObject({
        type: 'question',
        question: { kind: 'text', text: 'Opened or merged?' },
      });

      const pendingId = last?.type === 'question' ? last.question.pendingId : '';
      const second = await stream({
        prompt: 'Thank people for their pull requests on playground',
        answer: { pendingId, value: 'When they are opened' },
      });
      expect(second.at(-1)).toMatchObject({ type: 'drafted' });
      expect(model.requests[1]?.clarification).toBe('When they are opened');
    });

    it('refuses to continue another user’s pending question', async () => {
      await withKey([draftFor('', { status: 'needs_repository', question: 'Which repository?' })]);
      const first = await stream({ prompt: 'Thank authors of new PRs' });
      const last = first.at(-1);
      const pendingId = last?.type === 'question' ? last.question.pendingId : '';

      user = await signIn('bob', context.secretBox);
      await send('put', '/api/copilot/key', { provider: 'gemini', apiKey: VALID_KEY }).expect(200);
      const hijack = await stream({
        prompt: 'Thank authors of new PRs',
        answer: { pendingId, value: 'chawki/website' },
      });
      expect(hijack.at(-1)).toMatchObject({ type: 'failed', code: 'copilot_question_expired' });
    });

    it('sends validation problems back to the model once and keeps the corrected draft', async () => {
      await withKey([
        draftFor('someone/else', {
          actionConfig: [
            { key: 'body', value: 'Hi {{pr.reviewer}}' },
            { key: 'repository', value: '{{repo.fullName}}' },
            { key: 'number', value: '{{pr.number}}' },
          ],
        }),
        draftFor('chawki/playground'),
      ]);
      const events = await stream({ prompt: 'Thank authors of new PRs' });
      expect(events).toContainEqual({
        type: 'note',
        step: 'check',
        message: 'Found 2 problems, asking for a fix',
      });
      expect(events.at(-1)).toMatchObject({ type: 'drafted' });
      expect(model.requests[1]?.correction?.problems).toEqual([
        "trigger.config.repository: someone/else is not one of the user's repositories",
        'action.config.body: Unknown field {{pr.reviewer}}',
      ]);
    });

    it('gives up after one failed correction without saving anything', async () => {
      await withKey([draftFor('someone/else'), draftFor('someone/else')]);
      const events = await stream({ prompt: 'Thank authors of new PRs' });
      expect(events.at(-1)).toMatchObject({ type: 'failed', code: 'copilot_invalid_draft' });
      expect(await ZapModel.countDocuments()).toBe(0);
    });

    it('reports a request the catalogue cannot express as unsupported, not as an error', async () => {
      await withKey([
        draftFor('chawki/playground', {
          status: 'unsupported',
          explanation: 'Slack is not available yet.',
        }),
      ]);
      const events = await stream({ prompt: 'Post new PRs to Slack' });
      expect(events.at(-1)).toEqual({
        type: 'unsupported',
        message: 'Slack is not available yet.',
      });
      expect(await ZapModel.countDocuments()).toBe(0);
    });

    it('never lets one user draft with another user’s key', async () => {
      await send('put', '/api/copilot/key', { provider: 'gemini', apiKey: VALID_KEY }).expect(200);
      user = await signIn('bob', context.secretBox);
      await send('post', '/api/copilot/drafts', { prompt: 'Comment thanks on new PRs' }).expect(
        409,
      );
    });
  });
});
