import { z } from 'zod';

export const pullRequestPayload = z.object({
  action: z.string(),
  pull_request: z.object({
    number: z.number().int(),
    title: z.string(),
    body: z.string().nullable(),
    html_url: z.string(),
    draft: z.boolean(),
    merged: z.boolean().optional(),
    merged_by: z.object({ login: z.string() }).nullable().optional(),
    user: z.object({ login: z.string() }),
    base: z.object({ ref: z.string() }),
    head: z.object({ ref: z.string() }),
  }),
  repository: z.object({
    name: z.string(),
    full_name: z.string(),
    owner: z.object({ login: z.string() }),
  }),
  sender: z.object({ login: z.string() }),
});

export type PullRequestEvent = z.infer<typeof pullRequestPayload>;

export function sameRepository(
  event: { repository: { full_name: string } },
  configured: string,
): boolean {
  return event.repository.full_name.toLowerCase() === configured.toLowerCase();
}

export function pullRequestFields(event: PullRequestEvent) {
  return {
    'pr.number': event.pull_request.number,
    'pr.title': event.pull_request.title,
    'pr.body': event.pull_request.body ?? '',
    'pr.url': event.pull_request.html_url,
    'pr.author': event.pull_request.user.login,
    'pr.baseBranch': event.pull_request.base.ref,
    'pr.headBranch': event.pull_request.head.ref,
    'pr.draft': event.pull_request.draft,
    'repo.name': event.repository.name,
    'repo.owner': event.repository.owner.login,
    'repo.fullName': event.repository.full_name,
    'sender.login': event.sender.login,
  };
}

export const pullRequestOutputFields = [
  { key: 'pr.number', label: 'Pull request number' },
  { key: 'pr.title', label: 'Title' },
  { key: 'pr.body', label: 'Description' },
  { key: 'pr.url', label: 'URL' },
  { key: 'pr.author', label: 'Author login' },
  { key: 'pr.baseBranch', label: 'Base branch' },
  { key: 'pr.headBranch', label: 'Head branch' },
  { key: 'pr.draft', label: 'Is draft' },
  { key: 'repo.name', label: 'Repository name' },
  { key: 'repo.owner', label: 'Repository owner' },
  { key: 'repo.fullName', label: 'Repository full name' },
  { key: 'sender.login', label: 'Sender login' },
] as const;

export const samplePullRequest: PullRequestEvent = {
  action: 'opened',
  pull_request: {
    number: 42,
    title: 'Add rate limiting to the public API',
    body: 'Limits anonymous clients to 60 requests per minute.',
    html_url: 'https://github.com/your-org/your-repo/pull/42',
    draft: false,
    merged: false,
    merged_by: null,
    user: { login: 'pr-author' },
    base: { ref: 'main' },
    head: { ref: 'feature/rate-limit' },
  },
  repository: { name: 'your-repo', full_name: 'your-org/your-repo', owner: { login: 'your-org' } },
  sender: { login: 'pr-author' },
};
