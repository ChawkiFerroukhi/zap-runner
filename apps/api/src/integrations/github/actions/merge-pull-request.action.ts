import { z } from 'zod';
import { defineAction } from '../../define.js';
import { githubFailure } from '../github-failure.js';
import { repositoryOf, targetFields, targetSchema } from './target.js';

const METHODS = ['merge', 'squash', 'rebase'] as const;

export const mergePullRequest = defineAction({
  id: 'github.merge_pull_request',
  appId: 'github',
  group: 'Pull requests',
  name: 'Merge a pull request',
  description: 'Merges a pull request. Fails if branch protection or conflicts block the merge.',
  configFields: [
    {
      key: 'method',
      label: 'Merge method',
      kind: 'select',
      required: true,
      default: 'squash',
      options: [
        { value: 'merge', label: 'Create a merge commit' },
        { value: 'squash', label: 'Squash and merge' },
        { value: 'rebase', label: 'Rebase and merge' },
      ],
    },
    ...targetFields,
  ],
  config: z.object({ ...targetSchema, method: z.enum(METHODS) }),

  async execute(settings, context) {
    const repository = repositoryOf(settings.repository);
    try {
      const { data } = await context.github.rest.pulls.merge({
        owner: repository.owner,
        repo: repository.name,
        pull_number: settings.number,
        merge_method: settings.method,
      });
      return {
        ok: true,
        summary: `Merged ${repository.fullName}#${String(settings.number)}`,
        data: { sha: data.sha },
      };
    } catch (error) {
      return githubFailure(error);
    }
  },
});
