import { describe, expect, it } from 'vitest';
import { commentPayload, pullRequestPayload } from '../../testing/fixtures.js';
import { commentCreated } from './comment-created.trigger.js';
import { withLoopMarker } from './loop-marker.js';
import { pullRequestMerged } from './pull-request-merged.trigger.js';

describe('pull request merged trigger', () => {
  const config = { repository: 'chawki/playground', baseBranch: '' };

  it('matches a merged pull request and exposes who merged it', () => {
    expect(
      pullRequestMerged.evaluate(pullRequestPayload({ action: 'closed', merged: true }), config),
    ).toMatchObject({
      status: 'matched',
      fields: { 'pr.number': 42, 'pr.mergedBy': 'maintainer' },
    });
  });

  it('skips a pull request closed without merging', () => {
    const evaluation = pullRequestMerged.evaluate(
      pullRequestPayload({ action: 'closed', merged: false }),
      config,
    );
    expect(evaluation).toEqual({ status: 'skipped', reason: 'Pull request was not merged' });
  });

  it('honours the base branch filter', () => {
    const payload = pullRequestPayload({ action: 'closed', merged: true, baseBranch: 'develop' });
    expect(pullRequestMerged.evaluate(payload, { ...config, baseBranch: 'main' }).status).toBe(
      'skipped',
    );
    expect(pullRequestMerged.evaluate(payload, { ...config, baseBranch: 'develop' }).status).toBe(
      'matched',
    );
  });
});

describe('comment created trigger', () => {
  const config = { repository: 'chawki/playground' };

  it('matches a human comment and exposes the comment and its issue', () => {
    expect(commentCreated.evaluate(commentPayload(), config)).toMatchObject({
      status: 'matched',
      fields: { 'comment.author': 'reviewer', 'issue.number': 42, 'issue.isPullRequest': true },
    });
  });

  it('ignores comments posted by a Zap so a comment action cannot loop', () => {
    const payload = commentPayload({ body: withLoopMarker('Thanks, noted.', 'zap-1') });
    expect(commentCreated.evaluate(payload, config)).toEqual({
      status: 'skipped',
      reason: 'Comment was posted by a Zap',
    });
  });

  it('only runs for comments on pull requests, not on issues', () => {
    const onIssue = commentPayload({ onPullRequest: false });
    expect(commentCreated.evaluate(onIssue, config)).toEqual({
      status: 'skipped',
      reason: 'Comment is on an issue, not a pull request',
    });
  });
});
