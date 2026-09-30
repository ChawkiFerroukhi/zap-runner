import { pino } from 'pino';
import { describe, expect, it } from 'vitest';
import { createFakeGitHub } from '../../testing/fake-github.js';
import { registry } from '../registry.js';
import { addLabels } from './actions/add-labels.action.js';
import { addReaction } from './actions/add-reaction.action.js';
import { mergePullRequest } from './actions/merge-pull-request.action.js';
import { requestReviewers } from './actions/request-reviewers.action.js';
import { close } from './actions/set-state.action.js';

const repository = {
  name: 'playground',
  full_name: 'chawki/playground',
  owner: { login: 'chawki' },
};
const config = { repository: 'chawki/playground' };

function trigger(id: string) {
  const found = registry.trigger(id);
  if (!found) throw new Error(`Missing trigger ${id}`);
  return found;
}

function pullRequest(extra: Record<string, unknown> = {}) {
  return {
    number: 42,
    title: 'Add rate limiting',
    html_url: 'https://github.com/chawki/playground/pull/42',
    state: 'open',
    user: { login: 'octocat' },
    base: { ref: 'main' },
    head: { ref: 'feature', sha: 'abc123' },
    labels: [{ name: 'enhancement' }],
    ...extra,
  };
}

describe('github event catalog', () => {
  it('registers ten pull request triggers with unique ids', () => {
    const ids = registry.describe().triggers.map((entry) => entry.id);
    expect(ids).toEqual([
      'github.pull_request.opened',
      'github.pull_request.merged',
      'github.pull_request.closed',
      'github.pull_request.reopened',
      'github.pull_request.ready_for_review',
      'github.pull_request.review_requested',
      'github.pull_request.synchronize',
      'github.pull_request.labeled',
      'github.pull_request_review.submitted',
      'github.issue_comment.created',
    ]);
  });

  it('matches a pull request marked ready for review and exposes its fields', () => {
    const evaluation = trigger('github.pull_request.ready_for_review').evaluate(
      {
        action: 'ready_for_review',
        pull_request: pullRequest(),
        repository,
        sender: { login: 'maintainer' },
      },
      config,
    );
    expect(evaluation).toMatchObject({
      status: 'matched',
      fields: {
        'pr.number': 42,
        'pr.labels': 'enhancement',
        'pr.headSha': 'abc123',
        'sender.login': 'maintainer',
      },
    });
  });

  it('skips another action of the same event with a reason', () => {
    const evaluation = trigger('github.pull_request.ready_for_review').evaluate(
      { action: 'closed', pull_request: pullRequest(), repository },
      config,
    );
    expect(evaluation).toEqual({
      status: 'skipped',
      reason: 'Pull request action is "closed", not "ready_for_review"',
    });
  });

  it('matches a labeled pull request and exposes the label that was added', () => {
    const evaluation = trigger('github.pull_request.labeled').evaluate(
      { action: 'labeled', pull_request: pullRequest(), label: { name: 'bug' }, repository },
      config,
    );
    expect(evaluation).toMatchObject({ status: 'matched', fields: { 'label.name': 'bug' } });
  });

  it('matches a submitted review and exposes its state', () => {
    const evaluation = trigger('github.pull_request_review.submitted').evaluate(
      {
        action: 'submitted',
        pull_request: pullRequest(),
        review: { state: 'approved', body: 'Ship it', user: { login: 'reviewer' } },
        repository,
      },
      config,
    );
    expect(evaluation).toMatchObject({
      status: 'matched',
      fields: { 'review.state': 'approved', 'review.author': 'reviewer', 'pr.number': 42 },
    });
    expect(
      trigger('github.pull_request_review.submitted').evaluate(
        {
          action: 'submitted',
          pull_request: pullRequest(),
          review: { state: 'approved', user: { login: 'r' } },
          repository,
        },
        { repository: 'chawki/other' },
      ).status,
    ).toBe('skipped');
  });

  it('targets the pull request number in every action by default', () => {
    for (const action of registry.describe().actions) {
      const number = action.configFields.find((field) => field.key === 'number');
      expect(number?.default, action.id).toBe('{{pr.number}}');
    }
  });
});

describe('github actions', () => {
  const values = {
    'repo.fullName': 'chawki/playground',
    'pr.number': 42,
    'sender.login': 'maintainer',
  };

  async function run(action: typeof addLabels, settings: Record<string, string>) {
    const github = createFakeGitHub();
    github.respond(
      'POST',
      /.*/,
      200,
      { id: 1, number: 43, html_url: 'https://github.com/x', sha: 'merged-sha' },
      5,
    );
    github.respond('PUT', /.*/, 200, { sha: 'merged-sha' }, 5);
    github.respond('PATCH', /.*/, 200, {}, 5);
    const outcome = await action.run(
      { repository: '{{repo.fullName}}', number: '{{pr.number}}', ...settings },
      values,
      { zapId: 'zap-1', github: await github.githubFor(''), logger: pino({ level: 'silent' }) },
    );
    return { outcome, github };
  }

  it('adds comma separated labels', async () => {
    const { outcome, github } = await run(addLabels, { labels: 'bug, needs-triage' });
    expect(outcome.result.ok).toBe(true);
    expect(github.requestsTo('POST', /\/issues\/42\/labels$/)[0]?.body).toEqual({
      labels: ['bug', 'needs-triage'],
    });
  });

  it('requests reviewers mapped from the trigger', async () => {
    const { github } = await run(requestReviewers, { reviewers: '{{sender.login}}' });
    expect(github.requestsTo('POST', /\/pulls\/42\/requested_reviewers$/)[0]?.body).toEqual({
      reviewers: ['maintainer'],
    });
  });

  it('closes the pull request', async () => {
    const { github } = await run(close, {});
    expect(github.requestsTo('PATCH', /\/issues\/42$/)[0]?.body).toEqual({ state: 'closed' });
  });

  it('reacts with the chosen reaction and rejects one GitHub does not support', async () => {
    const { github } = await run(addReaction, { content: 'rocket' });
    expect(github.requestsTo('POST', /\/issues\/42\/reactions$/)[0]?.body).toEqual({
      content: 'rocket',
    });
    const { outcome } = await run(addReaction, { content: 'party' });
    expect(outcome.result).toMatchObject({ ok: false, retryable: false });
  });

  it('merges with the chosen method', async () => {
    const { github } = await run(mergePullRequest, { method: 'rebase' });
    expect(github.requestsTo('PUT', /\/pulls\/42\/merge$/)[0]?.body).toEqual({
      merge_method: 'rebase',
    });
  });
});
