import type { ConfigField } from '@zap-runner/shared';
import { z } from 'zod';
import { repositoryName, toRepositoryRef } from '../../define.js';
import type { RepositoryRef } from '../../definitions.js';

export const targetFields: ConfigField[] = [
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
    label: 'Pull request number',
    kind: 'template',
    required: true,
    default: '{{pr.number}}',
    help: 'Maps to the pull request that triggered the Zap.',
  },
];

export const targetSchema = {
  repository: repositoryName,
  number: z.coerce.number().int().positive('Must resolve to a pull request number'),
};

export const listSchema = z
  .string()
  .transform((value) =>
    value
      .split(',')
      .map((item) => item.trim())
      .filter((item) => item.length > 0),
  )
  .pipe(z.array(z.string()).min(1, 'Must resolve to at least one value'));

export function repositoryOf(fullName: string): RepositoryRef {
  const repository = toRepositoryRef(fullName);
  if (!repository) throw new Error(`Invalid repository ${fullName}`);
  return repository;
}
