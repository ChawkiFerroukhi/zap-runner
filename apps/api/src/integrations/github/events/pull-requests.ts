import { z } from 'zod';
import { defineEventFamily, flag, logins, names, text, userSchema } from './family.js';

const pullRequestSchema = z.looseObject({
  number: z.number().int(),
  title: z.string(),
  body: z.string().nullable().optional(),
  html_url: z.string(),
  state: z.string().optional(),
  draft: z.boolean().optional(),
  merged: z.boolean().optional(),
  user: userSchema,
  merged_by: userSchema.nullable().optional(),
  base: z.looseObject({ ref: z.string() }),
  head: z.looseObject({ ref: z.string(), sha: z.string().optional() }),
  labels: z.array(z.unknown()).optional(),
  assignees: z.array(z.unknown()).optional(),
  requested_reviewers: z.array(z.unknown()).optional(),
});

type PullRequest = z.infer<typeof pullRequestSchema>;

const PULL_REQUEST_FIELDS = [
  { key: 'pr.number', label: 'Pull request number' },
  { key: 'pr.title', label: 'Title' },
  { key: 'pr.body', label: 'Description' },
  { key: 'pr.url', label: 'URL' },
  { key: 'pr.author', label: 'Author login' },
  { key: 'pr.state', label: 'State' },
  { key: 'pr.draft', label: 'Is draft' },
  { key: 'pr.merged', label: 'Is merged' },
  { key: 'pr.mergedBy', label: 'Merged by' },
  { key: 'pr.baseBranch', label: 'Base branch' },
  { key: 'pr.headBranch', label: 'Head branch' },
  { key: 'pr.headSha', label: 'Head commit SHA' },
  { key: 'pr.labels', label: 'Labels' },
  { key: 'pr.assignees', label: 'Assignees' },
  { key: 'pr.reviewers', label: 'Requested reviewers' },
];

const PULL_REQUEST_SAMPLE = {
  'pr.number': 42,
  'pr.title': 'Add rate limiting to the public API',
  'pr.body': 'Limits anonymous clients to 60 requests per minute.',
  'pr.url': 'https://github.com/your-org/your-repo/pull/42',
  'pr.author': 'pr-author',
  'pr.state': 'open',
  'pr.draft': false,
  'pr.merged': false,
  'pr.baseBranch': 'main',
  'pr.headBranch': 'feature/rate-limit',
  'pr.headSha': '6dcb09b5b57875f334f61aebed695e2e4193db5e',
  'pr.labels': 'enhancement',
  'pr.assignees': 'maintainer',
  'pr.reviewers': 'reviewer',
};

const HINTS = { repository: '{{repo.fullName}}', number: '{{pr.number}}' };

function pullRequestFields(pullRequest: PullRequest) {
  return {
    'pr.number': pullRequest.number,
    'pr.title': pullRequest.title,
    'pr.body': pullRequest.body ?? '',
    'pr.url': pullRequest.html_url,
    'pr.author': pullRequest.user.login,
    'pr.state': text(pullRequest.state),
    'pr.draft': flag(pullRequest.draft),
    'pr.merged': flag(pullRequest.merged),
    'pr.mergedBy': pullRequest.merged_by?.login ?? '',
    'pr.baseBranch': pullRequest.base.ref,
    'pr.headBranch': pullRequest.head.ref,
    'pr.headSha': text(pullRequest.head.sha),
    'pr.labels': names(pullRequest.labels),
    'pr.assignees': logins(pullRequest.assignees),
    'pr.reviewers': logins(pullRequest.requested_reviewers),
  };
}

export const pullRequestTriggers = defineEventFamily({
  event: 'pull_request',
  group: 'Pull requests',
  noun: 'Pull request',
  actions: {
    closed: 'Runs when a pull request is closed, whether or not it was merged.',
    reopened: 'Runs when a closed pull request is reopened.',
    ready_for_review: 'Runs when a draft pull request is marked ready for review.',
    review_requested: 'Runs when a review is requested on a pull request.',
    synchronize: 'Runs when new commits are pushed to a pull request.',
    labeled: 'Runs when a label is added to a pull request.',
  },
  payload: z.looseObject({
    pull_request: pullRequestSchema,
    label: z.looseObject({ name: z.string() }).optional(),
    assignee: userSchema.nullable().optional(),
    requested_reviewer: userSchema.nullable().optional(),
  }),
  fields: [
    ...PULL_REQUEST_FIELDS,
    { key: 'label.name', label: 'Label added or removed' },
    { key: 'assignee.login', label: 'Assignee added or removed' },
    { key: 'reviewer.login', label: 'Reviewer requested or removed' },
  ],
  sample: {
    ...PULL_REQUEST_SAMPLE,
    'label.name': 'enhancement',
    'assignee.login': 'maintainer',
    'reviewer.login': 'reviewer',
  },
  mappingHints: HINTS,
  extract: (payload) => ({
    ...pullRequestFields(payload.pull_request),
    'label.name': payload.label?.name ?? '',
    'assignee.login': payload.assignee?.login ?? '',
    'reviewer.login': payload.requested_reviewer?.login ?? '',
  }),
});

export const pullRequestReviewTriggers = defineEventFamily({
  event: 'pull_request_review',
  group: 'Reviews and comments',
  noun: 'Pull request review',
  actions: {
    submitted: 'Runs when a review is submitted on a pull request.',
  },
  payload: z.looseObject({
    pull_request: pullRequestSchema,
    review: z.looseObject({
      state: z.string(),
      body: z.string().nullable().optional(),
      html_url: z.string().optional(),
      user: userSchema,
    }),
  }),
  fields: [
    ...PULL_REQUEST_FIELDS,
    { key: 'review.state', label: 'Review state' },
    { key: 'review.body', label: 'Review text' },
    { key: 'review.author', label: 'Reviewer login' },
    { key: 'review.url', label: 'Review URL' },
  ],
  sample: {
    ...PULL_REQUEST_SAMPLE,
    'review.state': 'approved',
    'review.body': 'Looks good to me.',
    'review.author': 'reviewer',
    'review.url': 'https://github.com/your-org/your-repo/pull/42#pullrequestreview-1',
  },
  mappingHints: HINTS,
  extract: (payload) => ({
    ...pullRequestFields(payload.pull_request),
    'review.state': payload.review.state,
    'review.body': payload.review.body ?? '',
    'review.author': payload.review.user.login,
    'review.url': text(payload.review.html_url),
  }),
});
