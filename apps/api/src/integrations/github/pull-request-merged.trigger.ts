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
  baseBranch: z.string().trim().default(''),
});

export const pullRequestMerged = defineTrigger({
  id: 'github.pull_request.merged',
  appId: 'github',
  name: 'Pull request merged',
  description: 'Runs when a pull request is merged. Closed without merging does not count.',
  webhookEvent: 'pull_request',
  configFields: [
    { key: 'repository', label: 'Repository', kind: 'repository', required: true },
    {
      key: 'baseBranch',
      label: 'Only when merged into',
      kind: 'text',
      required: false,
      placeholder: 'main',
      help: 'Leave empty to run for every base branch.',
    },
  ],
  config,
  payload: pullRequestPayload,
  outputFields: [...pullRequestOutputFields, { key: 'pr.mergedBy', label: 'Merged by' }],
  mappingHints: {
    body: 'Merged by @{{pr.mergedBy}}. Thanks @{{pr.author}} for the contribution.',
    repository: '{{repo.fullName}}',
    number: '{{pr.number}}',
  },
  sample: {
    ...samplePullRequest,
    action: 'closed',
    pull_request: {
      ...samplePullRequest.pull_request,
      merged: true,
      merged_by: { login: 'maintainer' },
    },
  },

  match(event, settings) {
    if (event.action !== 'closed' || event.pull_request.merged !== true) {
      return { matched: false, reason: 'Pull request was not merged' };
    }
    if (!sameRepository(event, settings.repository)) {
      return { matched: false, reason: `Event is for ${event.repository.full_name}` };
    }
    if (settings.baseBranch !== '' && event.pull_request.base.ref !== settings.baseBranch) {
      return {
        matched: false,
        reason: `Merged into ${event.pull_request.base.ref}, not ${settings.baseBranch}`,
      };
    }
    return { matched: true };
  },

  extract: (event) => ({
    ...pullRequestFields(event),
    'pr.mergedBy': event.pull_request.merged_by?.login ?? '',
  }),
});
