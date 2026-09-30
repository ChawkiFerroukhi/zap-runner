import { RequestError } from '@octokit/request-error';
import express from 'express';
import { pino } from 'pino';
import { pinoHttp } from 'pino-http';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { errorFrom } from '../testing/responses.js';
import { errorHandler } from './errors.js';

function githubError(status: number, headers: Record<string, string> = {}): RequestError {
  return new RequestError('Raw GitHub detail - https://docs.github.com/rest', status, {
    request: { method: 'GET', url: 'https://api.github.com/user/repos', headers: {} },
    response: { status, url: 'https://api.github.com/user/repos', headers, data: {} },
  });
}

function appThrowing(error: unknown) {
  const app = express();
  app.use(pinoHttp({ logger: pino({ level: 'silent' }) }));
  app.use(express.json({ limit: '1kb' }));
  app.post('/boom', () => {
    throw error;
  });
  app.use(errorHandler);
  return app;
}

describe('error handler', () => {
  it('turns a rejected GitHub token into a clear sign-in-again message instead of a 500', async () => {
    const response = await request(appThrowing(githubError(401)))
      .post('/boom')
      .expect(401);
    expect(response.body).toEqual({
      error: {
        code: 'github_token_invalid',
        message: 'GitHub no longer accepts your sign-in. Sign out and sign in again.',
      },
    });
  });

  it.each([
    [githubError(429), 503, 'github_rate_limited'],
    [githubError(403, { 'x-ratelimit-remaining': '0' }), 503, 'github_rate_limited'],
    [githubError(502), 502, 'github_unreachable'],
    [githubError(422), 502, 'github_error'],
  ])('maps a GitHub failure to a human error without its raw text', async (error, status, code) => {
    const response = await request(appThrowing(error)).post('/boom').expect(status);
    expect(errorFrom(response).code).toBe(code);
    expect(JSON.stringify(response.body)).not.toContain('Raw GitHub detail');
  });

  it('answers malformed JSON with 400 invalid_json', async () => {
    const response = await request(appThrowing(new Error('unreached')))
      .post('/boom')
      .set('content-type', 'application/json')
      .send('{"name":')
      .expect(400);
    expect(errorFrom(response).code).toBe('invalid_json');
  });

  it('answers an oversized body with 413 payload_too_large', async () => {
    const response = await request(appThrowing(new Error('unreached')))
      .post('/boom')
      .send({ text: 'x'.repeat(2048) })
      .expect(413);
    expect(errorFrom(response).code).toBe('payload_too_large');
  });

  it('never leaks the message of an unexpected error', async () => {
    const response = await request(appThrowing(new Error('mongo connection string leaked')))
      .post('/boom')
      .expect(500);
    expect(response.body).toEqual({ error: { code: 'internal', message: 'Something went wrong' } });
  });
});
