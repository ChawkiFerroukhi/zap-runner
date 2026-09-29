import { z } from 'zod';
import { defineTrigger, repositoryName } from '../define.js';

const payload = z.object({
  action: z.string(),
  pull_request: z.object({
    number: z.number().int(),
    title: z.string(),
    body: z.string().nullable(),
    html_url: z.string(),
    draft: z.boolean(),
    user: z.object({ login: z.string() }),
    base: z.object({ ref: z.string() }),
    head: z.object({ ref: z.string() }),
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
  ignoreDrafts: z.boolean().default(false),
});

export const pullRequestOpened = defineTrigger({
  id: 'github.pull_request.opened',
  appId: 'github',
  name: 'Pull request opened',
  description: 'Runs when a pull request is opened in the repository.',
  webhookEvent: 'pull_request',
  configFields: [
    { key: 'repository', label: 'Repository', kind: 'repository', required: true },
    {
      key: 'ignoreDrafts',
      label: 'Ignore draft pull requests',
      kind: 'boolean',
      required: false,
      default: false,
    },
  ],
  config,
  payload,
  outputFields: [
    { key: 'pr.number', label: 'Pull request number' },
    { key: 'pr.title', label: 'Title' },
    { key: 'pr.body', label: 'Description' },
    { key: 'pr.url', label: 'URL' },
    { key: 'pr.author', label: 'Author login' },
    { key: 'pr.baseBranch', label: 'Base branch' },
    { key: 'pr.headBranch', label: 'Head branch' },
    { key: 'pr.draft', label: 'Is draft' },
    { key: 'repo.name', label: 'Repository name' },
    { key: 'repo.owner', label: 'Repository owner' },
    { key: 'repo.fullName', label: 'Repository full name' },
    { key: 'sender.login', label: 'Sender login' },
  ],
  sample: {
    action: 'opened',
    pull_request: {
      number: 42,
      title: 'Add rate limiting to the public API',
      body: 'Limits anonymous clients to 60 requests per minute.',
      html_url: 'https://github.com/octocat/hello-world/pull/42',
      draft: false,
      user: { login: 'octocat' },
      base: { ref: 'main' },
      head: { ref: 'feature/rate-limit' },
    },
    repository: {
      name: 'hello-world',
      full_name: 'octocat/hello-world',
      owner: { login: 'octocat' },
    },
    sender: { login: 'octocat' },
  },

  match(event, settings) {
    if (event.action !== 'opened') {
      return { matched: false, reason: `Pull request action is "${event.action}", not "opened"` };
    }
    if (event.repository.full_name.toLowerCase() !== settings.repository.toLowerCase()) {
      return { matched: false, reason: `Event is for ${event.repository.full_name}` };
    }
    if (settings.ignoreDrafts && event.pull_request.draft) {
      return { matched: false, reason: 'Pull request is a draft' };
    }
    return { matched: true };
  },

  extract(event) {
    return {
      'pr.number': event.pull_request.number,
      'pr.title': event.pull_request.title,
      'pr.body': event.pull_request.body ?? '',
      'pr.url': event.pull_request.html_url,
      'pr.author': event.pull_request.user.login,
      'pr.baseBranch': event.pull_request.base.ref,
      'pr.headBranch': event.pull_request.head.ref,
      'pr.draft': event.pull_request.draft,
      'repo.name': event.repository.name,
      'repo.owner': event.repository.owner.login,
      'repo.fullName': event.repository.full_name,
      'sender.login': event.sender.login,
    };
  },
});
