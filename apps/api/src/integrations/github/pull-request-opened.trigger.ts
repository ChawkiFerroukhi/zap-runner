import { z } from 'zod';
import { defineTrigger, repositoryName } from '../define.js';
import {
  pullRequestFields,
  pullRequestOutputFields,
  pullRequestPayload,
  sameRepository,
  samplePullRequest,
} from './pull-request-payload.js';

const config = z.object({
  repository: repositoryName,
  ignoreDrafts: z.boolean().default(false),
});

export const pullRequestOpened = defineTrigger({
  id: 'github.pull_request.opened',
  appId: 'github',
  group: 'Pull requests',
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
  payload: pullRequestPayload,
  outputFields: [...pullRequestOutputFields],
  mappingHints: {
    body: 'Thanks @{{pr.author}} for opening "{{pr.title}}". A reviewer will be with you shortly.',
    repository: '{{repo.fullName}}',
    number: '{{pr.number}}',
  },
  sample: samplePullRequest,

  match(event, settings) {
    if (event.action !== 'opened') {
      return { matched: false, reason: `Pull request action is "${event.action}", not "opened"` };
    }
    if (!sameRepository(event, settings.repository)) {
      return { matched: false, reason: `Event is for ${event.repository.full_name}` };
    }
    if (settings.ignoreDrafts && event.pull_request.draft) {
      return { matched: false, reason: 'Pull request is a draft' };
    }
    return { matched: true };
  },

  extract: pullRequestFields,
});
