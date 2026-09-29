import { z } from 'zod';
import { defineTrigger, repositoryName } from '../define.js';
import { hasLoopMarker } from './loop-marker.js';
import { sameRepository } from './pull-request-payload.js';

const payload = z.object({
  action: z.string(),
  issue: z.object({
    number: z.number().int(),
    title: z.string(),
    html_url: z.string(),
    user: z.object({ login: z.string() }),
    pull_request: z.looseObject({}).optional(),
  }),
  comment: z.object({
    body: z.string(),
    html_url: z.string(),
    user: z.object({ login: z.string() }),
  }),
  repository: z.object({
    name: z.string(),
    full_name: z.string(),
    owner: z.object({ login: z.string() }),
  }),
  sender: z.object({ login: z.string() }),
});

const config = z.object({
  repository: repositoryName,
  pullRequestsOnly: z.boolean().default(false),
});

export const commentCreated = defineTrigger({
  id: 'github.issue_comment.created',
  appId: 'github',
  name: 'Comment created',
  description:
    'Runs when someone comments on an issue or pull request. Comments posted by Zaps are ignored.',
  webhookEvent: 'issue_comment',
  configFields: [
    { key: 'repository', label: 'Repository', kind: 'repository', required: true },
    {
      key: 'pullRequestsOnly',
      label: 'Only comments on pull requests',
      kind: 'boolean',
      required: false,
      default: false,
    },
  ],
  config,
  payload,
  outputFields: [
    { key: 'comment.body', label: 'Comment text' },
    { key: 'comment.author', label: 'Comment author' },
    { key: 'comment.url', label: 'Comment URL' },
    { key: 'issue.number', label: 'Issue or pull request number' },
    { key: 'issue.title', label: 'Issue or pull request title' },
    { key: 'issue.author', label: 'Issue or pull request author' },
    { key: 'issue.isPullRequest', label: 'Is a pull request' },
    { key: 'repo.name', label: 'Repository name' },
    { key: 'repo.owner', label: 'Repository owner' },
    { key: 'repo.fullName', label: 'Repository full name' },
    { key: 'sender.login', label: 'Sender login' },
  ],
  mappingHints: {
    body: 'Thanks @{{comment.author}}, noted.',
    repository: '{{repo.fullName}}',
    number: '{{issue.number}}',
  },
  sample: {
    action: 'created',
    issue: {
      number: 42,
      title: 'Add rate limiting to the public API',
      html_url: 'https://github.com/your-org/your-repo/pull/42',
      user: { login: 'pr-author' },
      pull_request: {},
    },
    comment: {
      body: 'Could you add a test for the burst limit?',
      html_url: 'https://github.com/your-org/your-repo/pull/42#issuecomment-1',
      user: { login: 'reviewer' },
    },
    repository: {
      name: 'your-repo',
      full_name: 'your-org/your-repo',
      owner: { login: 'your-org' },
    },
    sender: { login: 'reviewer' },
  },

  match(event, settings) {
    if (event.action !== 'created') {
      return { matched: false, reason: `Comment action is "${event.action}", not "created"` };
    }
    if (!sameRepository(event, settings.repository)) {
      return { matched: false, reason: `Event is for ${event.repository.full_name}` };
    }
    if (hasLoopMarker(event.comment.body)) {
      return { matched: false, reason: 'Comment was posted by a Zap' };
    }
    if (settings.pullRequestsOnly && !event.issue.pull_request) {
      return { matched: false, reason: 'Comment is on an issue, not a pull request' };
    }
    return { matched: true };
  },

  extract: (event) => ({
    'comment.body': event.comment.body,
    'comment.author': event.comment.user.login,
    'comment.url': event.comment.html_url,
    'issue.number': event.issue.number,
    'issue.title': event.issue.title,
    'issue.author': event.issue.user.login,
    'issue.isPullRequest': event.issue.pull_request !== undefined,
    'repo.name': event.repository.name,
    'repo.owner': event.repository.owner.login,
    'repo.fullName': event.repository.full_name,
    'sender.login': event.sender.login,
  }),
});
