import type { RepositoryOption } from '@zap-runner/shared';
import { Router } from 'express';
import { currentAuth, requireAuth } from '../auth/authenticate.js';
import type { GitHubClientFactory } from './github-client.js';

const MAX_REPOSITORIES = 300;

export function repositoriesRouter(githubFor: GitHubClientFactory): Router {
  const router = Router();
  router.use(requireAuth);

  router.get('/repositories', async (req, res) => {
    const github = await githubFor(currentAuth(req).user.id);
    const repositories = await github.paginate(github.rest.repos.listForAuthenticatedUser, {
      per_page: 100,
      sort: 'pushed',
      affiliation: 'owner,collaborator,organization_member',
    });
    const options: RepositoryOption[] = repositories
      .filter((repository) => repository.permissions?.admin === true)
      .slice(0, MAX_REPOSITORIES)
      .map((repository) => ({ fullName: repository.full_name, private: repository.private }));
    res.json(options);
  });

  return router;
}
