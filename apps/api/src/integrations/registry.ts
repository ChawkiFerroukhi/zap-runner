import type { AppDescriptor, RegistryResponse } from '@zap-runner/shared';
import type { Action, Trigger } from './definitions.js';
import { comment } from './github/comment.action.js';
import { commentCreated } from './github/comment-created.trigger.js';
import { pullRequestMerged } from './github/pull-request-merged.trigger.js';
import { pullRequestOpened } from './github/pull-request-opened.trigger.js';

const apps: AppDescriptor[] = [
  {
    id: 'github',
    name: 'GitHub',
    description: 'Pull requests, issues and comments.',
    runnable: true,
  },
  { id: 'gitlab', name: 'GitLab', description: 'Merge requests and pipelines.', runnable: false },
  { id: 'slack', name: 'Slack', description: 'Channel messages and alerts.', runnable: false },
  { id: 'linear', name: 'Linear', description: 'Issues, cycles and projects.', runnable: false },
  { id: 'jira', name: 'Jira', description: 'Tickets and sprint boards.', runnable: false },
  { id: 'sentry', name: 'Sentry', description: 'Error and performance alerts.', runnable: false },
];

const triggers: Trigger[] = [pullRequestOpened, pullRequestMerged, commentCreated];

const actions: Action[] = [comment];

export interface Registry {
  describe(): RegistryResponse;
  trigger(id: string): Trigger | undefined;
  action(id: string): Action | undefined;
}

export function createRegistry(entries: {
  apps: AppDescriptor[];
  triggers: Trigger[];
  actions: Action[];
}): Registry {
  const triggerById = new Map(entries.triggers.map((trigger) => [trigger.descriptor.id, trigger]));
  const actionById = new Map(entries.actions.map((action) => [action.descriptor.id, action]));
  return {
    describe: () => ({
      apps: entries.apps,
      triggers: entries.triggers.map((trigger) => trigger.descriptor),
      actions: entries.actions.map((action) => action.descriptor),
    }),
    trigger: (id) => triggerById.get(id),
    action: (id) => actionById.get(id),
  };
}

export const registry = createRegistry({ apps, triggers, actions });
