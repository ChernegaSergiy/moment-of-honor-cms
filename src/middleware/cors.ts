// Handles CORS for the credentialed, cross-origin dashboard client.
//
// Only origins listed in ALLOWED_ORIGINS get Access-Control-Allow-Origin
// echoed back with Allow-Credentials — every other origin gets no CORS
// headers at all, so the browser blocks the response before JavaScript on
// that origin ever sees it. This is what actually enforces "only our
// dashboard can make credentialed requests", not the SameSite cookie
// attribute, which had to move to `None` to allow cross-origin use at all.

import type { MiddlewareHandler } from 'hono';
import type { Env } from '../types/env';
import { parseAllowedOrigins } from '../lib/allowedOrigins';

export function cors(): MiddlewareHandler<{ Bindings: Env }> {
  return async (c, next) => {
    const origin = c.req.header('Origin');
    const allowedOrigins = parseAllowedOrigins(c.env.ALLOWED_ORIGINS ?? '');
    const isAllowed = !!origin && allowedOrigins.includes(origin);

    if (c.req.method === 'OPTIONS') {
      const headers = new Headers();
      if (isAllowed) {
        headers.set('Access-Control-Allow-Origin', origin);
        headers.set('Access-Control-Allow-Credentials', 'true');
        headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
        headers.set('Access-Control-Allow-Headers', 'Content-Type');
        headers.set('Access-Control-Max-Age', '86400');
      }
      return new Response(null, { status: 204, headers });
    }

    await next();

    if (isAllowed) {
      c.res.headers.set('Access-Control-Allow-Origin', origin);
      c.res.headers.set('Access-Control-Allow-Credentials', 'true');
      c.res.headers.append('Vary', 'Origin');
    }
  };
}
