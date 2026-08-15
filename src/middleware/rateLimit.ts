// Simple fixed-window rate limiter backed by KV. Applied to the
// administrative API to keep a single author (or a compromised token) from
// exhausting the GitHub API rate limit shared by the whole App installation.

import type { MiddlewareHandler } from 'hono';
import type { Env } from '../types/env';

const WINDOW_SECONDS = 60;
const MAX_REQUESTS_PER_WINDOW = 30;

export function rateLimit(): MiddlewareHandler<{ Bindings: Env }> {
  return async (c, next) => {
    const identity =
      c.req.header('CF-Connecting-IP') ?? c.req.header('x-forwarded-for') ?? 'unknown';
    const window = Math.floor(Date.now() / 1000 / WINDOW_SECONDS);
    const key = `rate-limit:${identity}:${window}`;

    const current = Number((await c.env.CACHE.get(key)) ?? '0');

    if (current >= MAX_REQUESTS_PER_WINDOW) {
      return c.json({ error: 'Too many requests' }, 429);
    }

    await c.env.CACHE.put(key, String(current + 1), { expirationTtl: WINDOW_SECONDS + 5 });

    await next();
  };
}
