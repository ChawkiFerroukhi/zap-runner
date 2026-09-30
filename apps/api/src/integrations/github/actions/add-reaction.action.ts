import { z } from 'zod';
import { defineAction } from '../../define.js';
import { githubFailure } from '../github-failure.js';
import { repositoryOf, targetFields, targetSchema } from './target.js';

const REACTIONS = ['+1', '-1', 'laugh', 'confused', 'heart', 'hooray', 'rocket', 'eyes'] as const;

const REACTION_LABELS: Record<(typeof REACTIONS)[number], string> = {
  '+1': 'Thumbs up',
  '-1': 'Thumbs down',
  laugh: 'Laugh',
  confused: 'Confused',
  heart: 'Heart',
  hooray: 'Hooray',
  rocket: 'Rocket',
  eyes: 'Eyes',
};

export const addReaction = defineAction({
  id: 'github.add_reaction',
  appId: 'github',
  group: 'Pull requests',
  name: 'Add a reaction',
  description: 'Reacts to a pull request.',
  configFields: [
    {
      key: 'content',
      label: 'Reaction',
      kind: 'select',
      required: true,
      default: 'eyes',
      options: REACTIONS.map((value) => ({ value, label: REACTION_LABELS[value] })),
    },
    ...targetFields,
  ],
  config: z.object({ ...targetSchema, content: z.enum(REACTIONS) }),

  async execute(settings, context) {
    const repository = repositoryOf(settings.repository);
    try {
      await context.github.rest.reactions.createForIssue({
        owner: repository.owner,
        repo: repository.name,
        issue_number: settings.number,
        content: settings.content,
      });
      return {
        ok: true,
        summary: `Reacted ${REACTION_LABELS[settings.content]} on ${repository.fullName}#${String(settings.number)}`,
        data: { content: settings.content },
      };
    } catch (error) {
      return githubFailure(error);
    }
  },
});
