import { z } from 'zod';
import { defineAction } from '../../define.js';
import { githubFailure } from '../github-failure.js';
import { repositoryOf, targetFields, targetSchema } from './target.js';

function stateAction(state: 'closed' | 'open') {
  const closing = state === 'closed';
  return defineAction({
    id: closing ? 'github.close' : 'github.reopen',
    appId: 'github',
    group: 'Pull requests',
    name: closing ? 'Close' : 'Reopen',
    description: closing ? 'Closes the pull request.' : 'Reopens a closed pull request.',
    configFields: targetFields,
    config: z.object(targetSchema),

    async execute(settings, context) {
      const repository = repositoryOf(settings.repository);
      try {
        await context.github.rest.issues.update({
          owner: repository.owner,
          repo: repository.name,
          issue_number: settings.number,
          state,
        });
        return {
          ok: true,
          summary: `${closing ? 'Closed' : 'Reopened'} ${repository.fullName}#${String(settings.number)}`,
          data: { state },
        };
      } catch (error) {
        return githubFailure(error);
      }
    },
  });
}

export const close = stateAction('closed');

export const reopen = stateAction('open');
