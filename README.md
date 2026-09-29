# Zap Runner

A small workflow automation app in the spirit of Zapier's Zaps: a trigger plus an action. The first
Zap it runs is "GitHub pull request opened -> comment on that pull request".

## Running it

Requirements: Docker with Compose, and a GitHub account.

1. Create a GitHub OAuth App at <https://github.com/settings/developers>:
   - Homepage URL: `http://localhost:8080`
   - Authorization callback URL: `http://localhost:8080/api/auth/github/callback`
2. Create a webhook relay channel at <https://smee.io/new> and copy its URL.
3. Copy the environment file and fill it in:

   ```sh
   cp .env.example .env
   ```

   | Variable               | Value                                                   |
   | ---------------------- | ------------------------------------------------------- |
   | `GITHUB_CLIENT_ID`     | From the OAuth App                                      |
   | `GITHUB_CLIENT_SECRET` | Generated on the OAuth App page                         |
   | `ENCRYPTION_KEY`       | Output of `openssl rand -base64 32`                     |
   | `WEBHOOK_PUBLIC_URL`   | The smee channel URL                                    |
   | `GITHUB_REPO_ACCESS`   | `public` (default) or `all` to use private repositories |

4. Start everything:

   ```sh
   docker compose up --build
   ```

5. Open <http://localhost:8080> and sign in with GitHub.

After editing `.env`, recreate the api so it picks up the change:
`docker compose up -d --force-recreate api`.

| Service | Purpose                                                              |
| ------- | -------------------------------------------------------------------- |
| `web`   | Angular app served by nginx on port 8080, proxying `/api` to the api |
| `api`   | Express API on port 3000 inside the network                          |
| `mongo` | MongoDB 8, exposed on 27017 for local development                    |
| `smee`  | Forwards GitHub webhook deliveries from the smee channel to the api  |

## GitHub permissions

GitHub OAuth Apps cannot be limited to single repositories, so the app asks for the smallest scope
set that can register webhooks and post comments:

- `GITHUB_REPO_ACCESS=public`: `public_repo` and `admin:repo_hook`. `admin:` is needed because
  turning a Zap off deletes its webhook, which `write:repo_hook` does not allow.
- `GITHUB_REPO_ACCESS=all`: `repo`, the only OAuth scope that reaches private repositories. It
  already includes webhook access.

Tokens are encrypted with AES-256-GCM before they are stored.

## Copilot

The Zaps page has a Copilot that turns a sentence such as "When a pull request is opened, comment
thanks" into a Zap. The draft is saved turned off and opens in the builder, so nothing runs until you
review it and turn it on.

It needs an API key from one of three providers, chosen per user under Settings:

| Provider      | Cost                             | Where to get a key                            |
| ------------- | -------------------------------- | --------------------------------------------- |
| Google Gemini | Free tier, no card, rate limited | <https://aistudio.google.com/apikey>          |
| Anthropic     | Paid, billed by usage            | <https://console.anthropic.com/settings/keys> |

Keys are verified with the provider, stored encrypted, and only their last four characters are shown
again. `COPILOT_PROVIDER` and `COPILOT_API_KEY` in `.env` set an optional server-wide fallback key.
Without any key the rest of the app works unchanged.

Gemini's free models are sometimes overloaded, so `COPILOT_GEMINI_MODELS` is an ordered list: when
one model answers "overloaded" or "rate limited", the next is tried.

How a draft is produced:

1. The model receives the registry (triggers, actions, their settings and fields) and the user's
   admin repositories, and must answer in a JSON schema (structured outputs).
2. The answer is validated exactly like a Zap saved from the builder, plus a check that the
   repository belongs to the user.
3. If validation fails, the problems are sent back once for a corrected draft. A second failure is
   reported to the user and nothing is saved.

## Local development

Requires Node 24 (`nvm use`).

```sh
npm install
docker compose up -d mongo
npm run dev:api
npm run dev:web
```

For local development set `APP_URL=http://localhost:4200` and register that callback URL on the
OAuth App as well.

The Angular dev server runs on <http://localhost:4200> and proxies `/api` to the api on port 3000.

## Checks

```sh
npm run typecheck
npm run lint
npm test
```

CI runs the same commands plus a build of both Docker images.

## Repository layout

```
apps/api         Express API
apps/web         Angular app
packages/shared  Schemas and types shared by both sides
```
