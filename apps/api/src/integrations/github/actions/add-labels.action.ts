import { z } from 'zod';
import { defineAction } from '../../define.js';
import { githubFailure } from '../github-failure.js';
import { listSchema, repositoryOf, targetFields, targetSchema } from './target.js';

export const addLabels = defineAction({
  id: 'github.add_labels',
  appId: 'github',
  group: 'Pull requests',
  name: 'Add labels',
  description: 'Adds labels to the pull request. Missing labels are created by GitHub.',
  configFields: [
    {
      key: 'labels',
      label: 'Labels',
      kind: 'template',
      required: true,
      default: 'needs-review',
      help: 'Comma separated, for example: bug, needs-triage',
    },
    ...targetFields,
  ],
  config: z.object({ ...targetSchema, labels: listSchema }),

  async execute(settings, context) {
    const repository = repositoryOf(settings.repository);
    try {
      await context.github.rest.issues.addLabels({
        owner: repository.owner,
        repo: repository.name,
        issue_number: settings.number,
        labels: settings.labels,
      });
      return {
        ok: true,
        summary: `Added ${settings.labels.join(', ')} to ${repository.fullName}#${String(settings.number)}`,
        data: { labels: settings.labels },
      };
    } catch (error) {
      return githubFailure(error);
    }
  },
});
