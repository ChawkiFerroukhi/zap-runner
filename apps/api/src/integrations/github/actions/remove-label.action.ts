import { z } from 'zod';
import { defineAction } from '../../define.js';
import { githubFailure } from '../github-failure.js';
import { repositoryOf, targetFields, targetSchema } from './target.js';

export const removeLabel = defineAction({
  id: 'github.remove_label',
  appId: 'github',
  group: 'Pull requests',
  name: 'Remove a label',
  description: 'Removes one label from a pull request.',
  configFields: [
    { key: 'label', label: 'Label', kind: 'template', required: true, default: 'needs-review' },
    ...targetFields,
  ],
  config: z.object({
    ...targetSchema,
    label: z.string().trim().min(1, 'Label resolved to empty text'),
  }),

  async execute(settings, context) {
    const repository = repositoryOf(settings.repository);
    try {
      await context.github.rest.issues.removeLabel({
        owner: repository.owner,
        repo: repository.name,
        issue_number: settings.number,
        name: settings.label,
      });
      return {
        ok: true,
        summary: `Removed ${settings.label} from ${repository.fullName}#${String(settings.number)}`,
        data: { label: settings.label },
      };
    } catch (error) {
      return githubFailure(error);
    }
  },
});
