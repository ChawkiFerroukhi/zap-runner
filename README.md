# Zap Runner

A small workflow automation app in the spirit of Zapier's Zaps: a trigger plus an action. The first
Zap it runs is "GitHub pull request opened -> comment on that pull request".

## Running it

Requirements: Docker with Compose, and a GitHub account.

1. Create a webhook relay channel at <https://smee.io/new> and copy its URL.
2. Copy the environment file and fill it in:

   ```sh
   cp .env.example .env
   ```

   Set `WEBHOOK_PUBLIC_URL` to the smee channel URL.

3. Start everything:

   ```sh
   docker compose up --build
   ```

4. Open <http://localhost:8080>.

| Service | Purpose                                                              |
| ------- | -------------------------------------------------------------------- |
| `web`   | Angular app served by nginx on port 8080, proxying `/api` to the api |
| `api`   | Express API on port 3000 inside the network                          |
| `mongo` | MongoDB 8, exposed on 27017 for local development                    |
| `smee`  | Forwards GitHub webhook deliveries from the smee channel to the api  |

## Local development

Requires Node 24 (`nvm use`).

```sh
npm install
docker compose up -d mongo
npm run dev:api
npm run dev:web
```

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
