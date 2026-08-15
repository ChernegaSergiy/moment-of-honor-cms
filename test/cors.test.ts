import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import { cors } from '../src/middleware/cors';

function buildApp() {
  const app = new Hono<{ Bindings: { ALLOWED_ORIGINS: string } }>();
  app.use('*', cors());
  app.get('/ping', (c) => c.json({ ok: true }));
  return app;
}

const env = { ALLOWED_ORIGINS: 'https://dashboard.example' };

describe('cors middleware', () => {
  it('echoes Access-Control-Allow-Origin for an allowed origin', async () => {
    const app = buildApp();
    const res = await app.request('/ping', { headers: { Origin: 'https://dashboard.example' } }, env);

    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://dashboard.example');
    expect(res.headers.get('Access-Control-Allow-Credentials')).toBe('true');
  });

  it('omits CORS headers for a disallowed origin', async () => {
    const app = buildApp();
    const res = await app.request('/ping', { headers: { Origin: 'https://evil.example' } }, env);

    expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });

  it('answers preflight OPTIONS requests for an allowed origin', async () => {
    const app = buildApp();
    const res = await app.request(
      '/ping',
      { method: 'OPTIONS', headers: { Origin: 'https://dashboard.example' } },
      env,
    );

    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Methods')).toContain('POST');
  });

  it('answers preflight OPTIONS requests with no CORS headers for a disallowed origin', async () => {
    const app = buildApp();
    const res = await app.request(
      '/ping',
      { method: 'OPTIONS', headers: { Origin: 'https://evil.example' } },
      env,
    );

    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });
});
