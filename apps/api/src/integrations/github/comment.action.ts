import { z } from 'zod';
import { defineAction, repositoryName, toRepositoryRef } from '../define.js';
import { githubFailure } from './github-failure.js';
import { withLoopMarker } from './loop-marker.js';

const config = z.object({
  repository: repositoryName,
  number: z.coerce.number().int().positive('Must resolve to a pull request or issue number'),
  body: z.string().trim().min(1, 'Comment resolved to empty text'),
});

export const comment = defineAction({
  id: 'github.comment',
  appId: 'github',
  name: 'Comment on pull request or issue',
  description: 'Posts a comment on a pull request or issue.',
  configFields: [
    {
      key: 'body',
      label: 'Comment',
      kind: 'multiline-template',
      required: true,
      default: 'Thanks for the update. A maintainer will take a look shortly.',
    },
    {
      key: 'repository',
      label: 'Repository',
      kind: 'template',
      required: true,
      default: '{{repo.fullName}}',
      help: 'owner/name. Maps to the repository that triggered the Zap.',
    },
    {
      key: 'number',
      label: 'Pull request or issue number',
      kind: 'template',
      required: true,
      default: '{{pr.number}}',
      help: 'Maps to the pull request or issue that triggered the Zap.',
    },
  ],
  config,

  async execute(settings, context) {
    const repository = toRepositoryRef(settings.repository);
    if (!repository) return { ok: false, retryable: false, error: 'Invalid repository' };
    try {
      const { data } = await context.github.rest.issues.createComment({
        owner: repository.owner,
        repo: repository.name,
        issue_number: settings.number,
        body: withLoopMarker(settings.body, context.zapId),
      });
      return {
        ok: true,
        summary: `Commented on ${repository.fullName}#${settings.number}`,
        data: { commentId: data.id, url: data.html_url },
      };
    } catch (error) {
      return githubFailure(error);
    }
  },
});
