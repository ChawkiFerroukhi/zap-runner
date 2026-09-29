import { pino } from 'pino';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../app.js';

function appWith(database: boolean, accepting: boolean) {
  return createApp({
    logger: pino({ level: 'silent' }),
    readiness: () => ({ database, accepting }),
  });
}

describe('health endpoints', () => {
  it('reports liveness regardless of dependencies', async () => {
    await request(appWith(false, false)).get('/api/health').expect(200, { status: 'ok' });
  });

  it('reports ready only when the database is up and the server is accepting work', async () => {
    await request(appWith(true, true)).get('/api/ready').expect(200);
    const draining = await request(appWith(true, false)).get('/api/ready').expect(503);
    expect(draining.body).toEqual({
      status: 'not_ready',
      checks: { database: true, accepting: false },
    });
  });

  it('answers unknown routes with the shared error shape', async () => {
    const response = await request(appWith(true, true)).get('/api/nope').expect(404);
    expect(response.body).toEqual({ error: { code: 'not_found', message: 'Route not found' } });
  });
});
