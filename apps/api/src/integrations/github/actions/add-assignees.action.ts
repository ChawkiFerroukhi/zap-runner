import { z } from 'zod';
import { defineAction } from '../../define.js';
import { githubFailure } from '../github-failure.js';
import { listSchema, repositoryOf, targetFields, targetSchema } from './target.js';

export const addAssignees = defineAction({
  id: 'github.add_assignees',
  appId: 'github',
  group: 'Pull requests',
  name: 'Assign people',
  description: 'Assigns people to a pull request.',
  configFields: [
    {
      key: 'assignees',
      label: 'Assignees',
      kind: 'template',
      required: true,
      default: '{{sender.login}}',
      help: 'Comma separated GitHub logins.',
    },
    ...targetFields,
  ],
  config: z.object({ ...targetSchema, assignees: listSchema }),

  async execute(settings, context) {
    const repository = repositoryOf(settings.repository);
    try {
      await context.github.rest.issues.addAssignees({
        owner: repository.owner,
        repo: repository.name,
        issue_number: settings.number,
        assignees: settings.assignees,
      });
      return {
        ok: true,
        summary: `Assigned ${settings.assignees.join(', ')} to ${repository.fullName}#${String(settings.number)}`,
        data: { assignees: settings.assignees },
      };
    } catch (error) {
      return githubFailure(error);
    }
  },
});
