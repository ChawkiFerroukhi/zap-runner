import { RequestError } from '@octokit/request-error';
import express from 'express';
import { pino } from 'pino';
import { pinoHttp } from 'pino-http';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { errorHandler } from './errors.js';

describe('error handler', () => {
  it('turns a rejected GitHub token into a clear sign-in-again message instead of a 500', async () => {
    const app = express();
    app.use(pinoHttp({ logger: pino({ level: 'silent' }) }));
    app.get('/boom', () => {
      throw new RequestError('Bad credentials', 401, {
        request: { method: 'GET', url: 'https://api.github.com/user/repos', headers: {} },
      });
    });
    app.use(errorHandler);

    const response = await request(app).get('/boom').expect(401);
    expect(response.body).toEqual({
      error: {
        code: 'github_token_invalid',
        message: 'GitHub no longer accepts your sign-in. Sign out and sign in again.',
      },
    });
  });
});
