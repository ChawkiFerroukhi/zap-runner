import { Octokit } from '@octokit/rest';
import { z } from 'zod';

export interface GitHubProfile {
  id: number;
  login: string;
  name: string | null;
  avatarUrl: string;
}

export interface GitHubGrant {
  accessToken: string;
  scopes: string[];
}

export interface GitHubIdentity {
  authorizeUrl(state: string): string;
  exchangeCode(code: string): Promise<GitHubGrant>;
  fetchProfile(accessToken: string): Promise<GitHubProfile>;
}

export interface GitHubOAuthConfig {
  clientId: string;
  clientSecret: string;
  callbackUrl: string;
  scopes: readonly string[];
}

const tokenResponseSchema = z.union([
  z.object({ access_token: z.string().min(1), scope: z.string() }),
  z.object({ error: z.string(), error_description: z.string().optional() }),
]);

export function createGitHubIdentity(config: GitHubOAuthConfig): GitHubIdentity {
  return {
    authorizeUrl(state) {
      const url = new URL('https://github.com/login/oauth/authorize');
      url.searchParams.set('client_id', config.clientId);
      url.searchParams.set('redirect_uri', config.callbackUrl);
      url.searchParams.set('scope', config.scopes.join(' '));
      url.searchParams.set('state', state);
      url.searchParams.set('allow_signup', 'false');
      return url.toString();
    },

    async exchangeCode(code) {
      const response = await fetch('https://github.com/login/oauth/access_token', {
        method: 'POST',
        headers: { accept: 'application/json', 'content-type': 'application/json' },
        body: JSON.stringify({
          client_id: config.clientId,
          client_secret: config.clientSecret,
          code,
          redirect_uri: config.callbackUrl,
        }),
      });
      const body = tokenResponseSchema.parse(await response.json());
      if ('error' in body) {
        throw new Error(`GitHub rejected the code: ${body.error_description ?? body.error}`);
      }
      return {
        accessToken: body.access_token,
        scopes: body.scope.split(',').filter((scope) => scope.length > 0),
      };
    },

    async fetchProfile(accessToken) {
      const { data } = await new Octokit({ auth: accessToken }).rest.users.getAuthenticated();
      return { id: data.id, login: data.login, name: data.name, avatarUrl: data.avatar_url };
    },
  };
}

export function oauthScopes(repoAccess: 'public' | 'all'): readonly string[] {
  return repoAccess === 'all' ? ['repo'] : ['public_repo', 'admin:repo_hook'];
}
