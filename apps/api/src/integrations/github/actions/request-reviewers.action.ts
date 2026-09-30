import { z } from 'zod';
import { defineAction } from '../../define.js';
import { githubFailure } from '../github-failure.js';
import { listSchema, repositoryOf, targetFields, targetSchema } from './target.js';

export const requestReviewers = defineAction({
  id: 'github.request_reviewers',
  appId: 'github',
  group: 'Pull requests',
  name: 'Request reviewers',
  description: 'Requests reviews on a pull request.',
  configFields: [
    {
      key: 'reviewers',
      label: 'Reviewers',
      kind: 'template',
      required: true,
      help: 'Comma separated GitHub logins. The pull request author cannot review their own pull request.',
    },
    ...targetFields,
  ],
  config: z.object({ ...targetSchema, reviewers: listSchema }),

  async execute(settings, context) {
    const repository = repositoryOf(settings.repository);
    try {
      await context.github.rest.pulls.requestReviewers({
        owner: repository.owner,
        repo: repository.name,
        pull_number: settings.number,
        reviewers: settings.reviewers,
      });
      return {
        ok: true,
        summary: `Requested ${settings.reviewers.join(', ')} on ${repository.fullName}#${String(settings.number)}`,
        data: { reviewers: settings.reviewers },
      };
    } catch (error) {
      return githubFailure(error);
    }
  },
});
