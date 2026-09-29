import { describe, expect, it } from 'vitest';
import { pullRequestPayload } from '../../testing/fixtures.js';
import { registry } from '../registry.js';
import { pullRequestOpened } from './pull-request-opened.trigger.js';

const config = { repository: 'chawki/playground', ignoreDrafts: false };

describe('pull request opened trigger', () => {
  it('matches an opened pull request on the configured repository and exposes its fields', () => {
    const evaluation = pullRequestOpened.evaluate(pullRequestPayload(), config);
    expect(evaluation).toMatchObject({
      status: 'matched',
      fields: {
        'pr.number': 42,
        'pr.title': 'Add rate limiting',
        'pr.author': 'octocat',
        'pr.body': '',
        'repo.fullName': 'chawki/playground',
      },
    });
  });

  it('matches the repository name case-insensitively', () => {
    const evaluation = pullRequestOpened.evaluate(
      pullRequestPayload({ repository: 'Chawki/Playground' }),
      config,
    );
    expect(evaluation.status).toBe('matched');
  });

  it.each([
    ['another action', pullRequestPayload({ action: 'closed' }), config, /not "opened"/],
    [
      'another repository',
      pullRequestPayload({ repository: 'chawki/other' }),
      config,
      /chawki\/other/,
    ],
    [
      'a draft when drafts are ignored',
      pullRequestPayload({ draft: true }),
      { ...config, ignoreDrafts: true },
      /draft/,
    ],
    ['a payload of the wrong shape', { zen: 'Keep it logically awesome.' }, config, /shape/],
  ])('skips %s with a reason', (_case, payload, settings, reason) => {
    const evaluation = pullRequestOpened.evaluate(payload, settings);
    expect(evaluation.status).toBe('skipped');
    expect(evaluation.status === 'skipped' ? evaluation.reason : '').toMatch(reason);
  });

  it('still matches drafts when drafts are not ignored', () => {
    expect(pullRequestOpened.evaluate(pullRequestPayload({ draft: true }), config).status).toBe(
      'matched',
    );
  });
});

describe('registry', () => {
  it('gives every trigger a sample that covers each field it advertises', () => {
    for (const trigger of registry.describe().triggers) {
      for (const field of trigger.outputFields) {
        expect(trigger.sample, `${trigger.id} sample`).toHaveProperty([field.key]);
      }
    }
  });

  it('lists only runnable apps as the owners of triggers and actions', () => {
    const { apps, triggers, actions } = registry.describe();
    const runnable = new Set(apps.filter((app) => app.runnable).map((app) => app.id));
    for (const entry of [...triggers, ...actions]) expect(runnable.has(entry.appId)).toBe(true);
  });
});
